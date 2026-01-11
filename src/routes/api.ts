import { Hono } from 'hono';
import type { Env } from '../types/env';
import {
  getModels,
  getPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
} from '../services/storage';
import { collectForTopic } from '../services/collector';
import { createLLMProvider } from '../services/llm';
import { getModel } from '../services/storage';
import {
  queryResponses,
  getTopicsFromBigQuery,
  getRecentPrompts,
  insertRow,
  extractProductFamily,
  extractCompany,
  type BigQueryRow,
} from '../services/bigquery';
import { requireAccess } from '../middleware/access';
import { checkRateLimit, incrementRateLimit, getRateLimitStatus } from '../services/ratelimit';

type Variables = {
  userEmail?: string;
};

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

// Health check
api.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ==================== Topics (derived from BigQuery) ====================

// List all topics (from BigQuery - topics that have responses)
api.get('/topics', async (c) => {
  const result = await getTopicsFromBigQuery(c.env);
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }
  // Transform to match expected format
  const topics = result.data.map((t) => ({
    id: t.id,
    name: t.name,
    description: `${t.response_count} responses`,
    response_count: t.response_count,
  }));
  return c.json({ topics });
});

// Alias for backwards compatibility
api.get('/topics-with-responses', async (c) => {
  const result = await getTopicsFromBigQuery(c.env);
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }
  const topics = result.data.map((t) => ({
    id: t.id,
    name: t.name,
    description: `${t.response_count} responses`,
    response_count: t.response_count,
  }));
  return c.json({ topics });
});

// Get single topic (from BigQuery)
api.get('/topics/:id', async (c) => {
  const { id } = c.req.param();
  const result = await getTopicsFromBigQuery(c.env);
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }
  const topic = result.data.find((t) => t.id === id);
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }
  return c.json({
    topic: {
      id: topic.id,
      name: topic.name,
      description: `${topic.response_count} responses`,
      response_count: topic.response_count,
    },
  });
});

// Get responses for a topic (from BigQuery)
api.get('/topics/:id/responses', async (c) => {
  const { id } = c.req.param();
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const result = await queryResponses(c.env, id, { limit });
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ responses: result.data.rows, totalRows: result.data.totalRows });
});

// ==================== Prompt Lab History ====================

// Get recent prompts from Prompt Lab
api.get('/prompts', async (c) => {
  const limitParam = c.req.query('limit');
  const search = c.req.query('search');
  const modelsParam = c.req.query('models'); // comma-separated
  const companiesParam = c.req.query('companies'); // comma-separated
  const topicsParam = c.req.query('topics'); // comma-separated
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  // Parse comma-separated values into arrays
  const models = modelsParam ? modelsParam.split(',').filter(Boolean) : undefined;
  const companies = companiesParam ? companiesParam.split(',').filter(Boolean) : undefined;
  const topics = topicsParam ? topicsParam.split(',').filter(Boolean) : undefined;

  const result = await getRecentPrompts(c.env, {
    limit,
    search: search || undefined,
    models,
    companies,
    topics,
  });
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ prompts: result.data });
});

// ==================== Prompt Templates ====================

// List all prompt templates
api.get('/prompt-templates', async (c) => {
  const templates = await getPromptTemplates(c.env.DB);
  return c.json({ templates });
});

// Get single prompt template
api.get('/prompt-templates/:id', async (c) => {
  const { id } = c.req.param();
  const template = await getPromptTemplate(c.env.DB, id);
  if (!template) {
    return c.json({ error: 'Prompt template not found' }, 404);
  }
  return c.json({ template });
});

// Create a prompt template
api.post('/prompt-templates', async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    template: string;
    description?: string;
  }>();

  if (!body.id || !body.name || !body.template) {
    return c.json({ error: 'id, name, and template are required' }, 400);
  }

  // Check if template already exists
  const existing = await getPromptTemplate(c.env.DB, body.id);
  if (existing) {
    return c.json({ error: 'Prompt template already exists' }, 409);
  }

  const template = await createPromptTemplate(c.env.DB, body);
  return c.json({ template }, 201);
});

// ==================== Models ====================

// List all models
api.get('/models', async (c) => {
  const models = await getModels(c.env.DB);
  // Add computed company field (actual creator, not hosting provider)
  const modelsWithCompany = models.map((m) => ({
    ...m,
    company: extractCompany(m.provider, m.model_name),
  }));
  return c.json({ models: modelsWithCompany });
});

// ==================== Collection (Protected by Cloudflare Access) ====================

// Admin routes - protected by Access middleware
const admin = new Hono<{ Bindings: Env; Variables: Variables }>();
admin.use('*', requireAccess);

// Get rate limit status
admin.get('/rate-limits', async (c) => {
  const status = await getRateLimitStatus(c.env.DB);
  return c.json(status);
});

// Smoke test - verify all LLM APIs are working
admin.get('/test-models', async (c) => {
  const models = await getModels(c.env.DB);
  const testPrompt = 'Reply with exactly: OK';

  const results: Array<{
    modelId: string;
    displayName: string;
    provider: string;
    success: boolean;
    latencyMs?: number;
    error?: string;
  }> = [];

  for (const model of models) {
    const start = Date.now();
    try {
      const provider = createLLMProvider(model.id, model.provider, model.model_name, c.env);
      await provider.complete({ prompt: testPrompt, maxTokens: 10 });
      results.push({
        modelId: model.id,
        displayName: model.display_name,
        provider: model.provider,
        success: true,
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        modelId: model.id,
        displayName: model.display_name,
        provider: model.provider,
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return c.json({
    summary: { total: results.length, passed, failed },
    results,
  });
});

// Trigger collection (protected + rate limited)
admin.post('/collect', async (c) => {
  // Check rate limit (1 request = 1 model)
  const rateLimit = await checkRateLimit(c.env.DB, 'collect');
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: 'Daily rate limit exceeded',
        limit: rateLimit.limit,
        current: rateLimit.current,
        resetsAt: 'midnight UTC',
      },
      429
    );
  }
  const body = await c.req.json<{
    topicId?: string;
    topicName?: string;
    modelId: string;
    promptTemplateId: string;
    promptId?: string;
  }>();

  // Support both topicId (for existing topics) and topicName (for new topics)
  if ((!body.topicId && !body.topicName) || !body.modelId || !body.promptTemplateId) {
    return c.json({ error: 'topicId or topicName, modelId, and promptTemplateId are required' }, 400);
  }

  const result = await collectForTopic(
    body.topicId || body.topicName!,
    body.modelId,
    body.promptTemplateId,
    c.env,
    body.topicId ? body.topicName : undefined,
    body.promptId
  );

  // Increment rate limit counter
  await incrementRateLimit(c.env.DB, 'collect', 1);

  if (result.success) {
    return c.json({
      success: true,
      responseId: result.responseId,
      latencyMs: result.latencyMs,
    });
  } else {
    return c.json(
      {
        success: false,
        error: result.error,
        responseId: result.responseId,
      },
      500
    );
  }
});

// Batch collect (protected + rate limited) - collects for multiple combinations
admin.post('/collect-batch', async (c) => {
  const body = await c.req.json<{
    topicId?: string;
    topicName?: string;
    promptTemplateId: string;
    modelIds: string[];
    count?: number;
  }>();

  if ((!body.topicId && !body.topicName) || !body.promptTemplateId || !body.modelIds?.length) {
    return c.json(
      { error: 'topicId or topicName, promptTemplateId, and modelIds (non-empty array) are required' },
      400
    );
  }

  const count = body.count ?? 1;
  const totalRequests = body.modelIds.length * count;

  // Check rate limit before starting batch
  const rateLimit = await checkRateLimit(c.env.DB, 'collect');
  if (rateLimit.remaining < totalRequests) {
    return c.json(
      {
        error: 'Batch would exceed daily rate limit',
        requested: totalRequests,
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        resetsAt: 'midnight UTC',
      },
      429
    );
  }

  const results: Array<{
    modelId: string;
    iteration: number;
    success: boolean;
    responseId: string;
    latencyMs?: number;
    error?: string;
  }> = [];

  // Generate a prompt_id for this batch - all responses share the same prompt
  const promptId = crypto.randomUUID();

  for (const modelId of body.modelIds) {
    for (let i = 0; i < count; i++) {
      const result = await collectForTopic(
        body.topicId || body.topicName!,
        modelId,
        body.promptTemplateId,
        c.env,
        body.topicId ? body.topicName : undefined,
        promptId
      );
      results.push({
        modelId,
        iteration: i + 1,
        success: result.success,
        responseId: result.responseId,
        latencyMs: result.latencyMs,
        error: result.error,
      });
    }
  }

  // Increment rate limit by total requests made
  await incrementRateLimit(c.env.DB, 'collect', results.length);

  return c.json({
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
});

// Freeform prompt (protected + rate limited) - send prompt to selected models
admin.post('/prompt', async (c) => {
  const body = await c.req.json<{
    prompt: string;
    modelIds: string[];
    promptId?: string; // Optional - if provided, all responses will share this ID
  }>();

  if (!body.prompt || !body.modelIds?.length) {
    return c.json({ error: 'prompt and modelIds (non-empty array) are required' }, 400);
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(c.env.DB, 'prompt');
  if (rateLimit.remaining < body.modelIds.length) {
    return c.json(
      {
        error: 'Would exceed daily prompt rate limit',
        requested: body.modelIds.length,
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        resetsAt: 'midnight UTC',
      },
      429
    );
  }

  const collectedAt = new Date().toISOString();
  // Use provided promptId (for grouping across multiple requests) or generate new one
  const promptId = body.promptId || crypto.randomUUID();
  const results: Array<{
    modelId: string;
    model: string;
    response?: string;
    error?: string;
    latencyMs?: number;
    success: boolean;
  }> = [];

  for (const modelId of body.modelIds) {
    const model = await getModel(c.env.DB, modelId);
    if (!model) {
      results.push({
        modelId,
        model: modelId,
        error: 'Model not found',
        success: false,
      });
      continue;
    }

    const responseId = crypto.randomUUID();
    let responseContent: string | null = null;
    let errorMsg: string | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const provider = createLLMProvider(model.id, model.provider, model.model_name, c.env);
      const start = Date.now();
      const response = await provider.complete({ prompt: body.prompt });
      latencyMs = Date.now() - start;
      responseContent = response.content;
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;

      results.push({
        modelId,
        model: model.display_name,
        response: response.content,
        latencyMs,
        success: true,
      });
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
      results.push({
        modelId,
        model: model.display_name,
        error: errorMsg,
        success: false,
      });
    }

    // Save to BigQuery (fire and forget - don't block on this)
    const bqRow: BigQueryRow = {
      id: responseId,
      prompt_id: promptId,
      collected_at: collectedAt,
      source: 'prompt-lab',
      company: extractCompany(model.provider, model.model_name),
      product: extractProductFamily(model.model_name),
      model: model.model_name,
      topic_id: null,
      topic_name: null,
      prompt_template_id: null,
      prompt_template_name: null,
      prompt: body.prompt,
      response: responseContent,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error: errorMsg,
      success: !errorMsg,
    };
    insertRow(c.env, bqRow).catch((err) => {
      console.error('Failed to save prompt-lab response to BigQuery:', err);
    });
  }

  // Increment rate limit by number of models queried
  await incrementRateLimit(c.env.DB, 'prompt', results.length);

  return c.json({ results });
});

api.route('/admin', admin);

export { api };
