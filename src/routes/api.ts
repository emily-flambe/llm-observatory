import { Hono } from 'hono';
import type { Env } from '../types/env';
import {
  getTopics,
  getTopic,
  createTopic,
  getModels,
  getPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
} from '../services/storage';
import { collectForTopic } from '../services/collector';
import { createLLMProvider } from '../services/llm';
import { getModel } from '../services/storage';
import { queryResponses, getTopicIdsWithResponses } from '../services/bigquery';
import { requireAccess } from '../middleware/access';

type Variables = {
  userEmail?: string;
};

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

// Health check
api.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ==================== Topics ====================

// List all topics
api.get('/topics', async (c) => {
  const topics = await getTopics(c.env.DB);
  return c.json({ topics });
});

// List only topics that have responses (for Browse page)
api.get('/topics-with-responses', async (c) => {
  // Get topic IDs that have responses in BigQuery
  const topicIdsResult = await getTopicIdsWithResponses(c.env);
  if (!topicIdsResult.success) {
    return c.json({ error: topicIdsResult.error }, 500);
  }

  // Get all topics from D1
  const allTopics = await getTopics(c.env.DB);

  // Filter to only topics with responses
  const topicIdsSet = new Set(topicIdsResult.data);
  const topics = allTopics.filter((t) => topicIdsSet.has(t.id));

  return c.json({ topics });
});

// Get single topic
api.get('/topics/:id', async (c) => {
  const { id } = c.req.param();
  const topic = await getTopic(c.env.DB, id);
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }
  return c.json({ topic });
});

// Create a topic
api.post('/topics', async (c) => {
  const body = await c.req.json<{ id: string; name: string; description?: string }>();

  if (!body.id || !body.name) {
    return c.json({ error: 'id and name are required' }, 400);
  }

  // Check if topic already exists
  const existing = await getTopic(c.env.DB, body.id);
  if (existing) {
    return c.json({ error: 'Topic already exists' }, 409);
  }

  const topic = await createTopic(c.env.DB, body);
  return c.json({ topic }, 201);
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
  return c.json({ models });
});

// ==================== Collection (Protected by Cloudflare Access) ====================

// Admin routes - protected by Access middleware
const admin = new Hono<{ Bindings: Env; Variables: Variables }>();
admin.use('*', requireAccess);

// Trigger collection (protected)
admin.post('/collect', async (c) => {
  const body = await c.req.json<{
    topicId: string;
    modelId: string;
    promptTemplateId: string;
  }>();

  if (!body.topicId || !body.modelId || !body.promptTemplateId) {
    return c.json({ error: 'topicId, modelId, and promptTemplateId are required' }, 400);
  }

  const result = await collectForTopic(body.topicId, body.modelId, body.promptTemplateId, c.env);

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

// Batch collect (protected) - collects for multiple combinations
admin.post('/collect-batch', async (c) => {
  const body = await c.req.json<{
    topicId: string;
    promptTemplateId: string;
    modelIds: string[];
    count?: number;
  }>();

  if (!body.topicId || !body.promptTemplateId || !body.modelIds?.length) {
    return c.json(
      { error: 'topicId, promptTemplateId, and modelIds (non-empty array) are required' },
      400
    );
  }

  const count = body.count ?? 1;
  const results: Array<{
    modelId: string;
    iteration: number;
    success: boolean;
    responseId: string;
    latencyMs?: number;
    error?: string;
  }> = [];

  for (const modelId of body.modelIds) {
    for (let i = 0; i < count; i++) {
      const result = await collectForTopic(body.topicId, modelId, body.promptTemplateId, c.env);
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

  return c.json({
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
});

// Freeform prompt (protected) - send prompt to selected models
admin.post('/prompt', async (c) => {
  const body = await c.req.json<{
    prompt: string;
    modelIds: string[];
  }>();

  if (!body.prompt || !body.modelIds?.length) {
    return c.json({ error: 'prompt and modelIds (non-empty array) are required' }, 400);
  }

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

    try {
      const provider = createLLMProvider(model.id, model.provider, model.model_name, c.env);
      const start = Date.now();
      const response = await provider.complete({ prompt: body.prompt });
      const latencyMs = Date.now() - start;

      results.push({
        modelId,
        model: model.display_name,
        response: response.content,
        latencyMs,
        success: true,
      });
    } catch (err) {
      results.push({
        modelId,
        model: model.display_name,
        error: err instanceof Error ? err.message : 'Unknown error',
        success: false,
      });
    }
  }

  return c.json({ results });
});

api.route('/admin', admin);

export { api };
