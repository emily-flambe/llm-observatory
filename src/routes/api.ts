import { Hono } from 'hono';
import type { Env } from '../types/env';
import {
  getModels,
  getPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
  getModelSyncLogs,
  getCollections,
  getCollection,
  getCollectionByTopicAndTemplate,
  createCollection,
  updateCollection,
  deleteCollection,
  restoreCollection,
  getCollectionVersionModels,
  getCollectionVersions,
  updateCollectionLastRunAt,
  getTopic,
  createTopic,
} from '../services/storage';
import { syncAllProviders } from '../services/model-sync';
import { syncBasellmMetadata } from '../services/basellm';
import { collectForTopic } from '../services/collector';
import { createLLMProvider } from '../services/llm';
import { getModel } from '../services/storage';
import {
  queryResponses,
  getTopicsFromBigQuery,
  getRecentPrompts,
  getCollectionResponses,
  insertRow,
  extractProductFamily,
  extractCompany,
  type BigQueryRow,
} from '../services/bigquery';
import { requireAccess } from '../middleware/access';
import { checkRateLimit, incrementRateLimit, getRateLimitStatus } from '../services/ratelimit';
import { createTag, getTags, deleteTag } from '../services/tags';
import {
  createObservation,
  getObservation,
  getObservations,
  updateObservation,
  deleteObservation,
  restoreObservation,
  getObservationVersionModels,
  getObservationTags,
  getObservationVersions,
  updateObservationLastRunAt,
  createObservationRun,
  getObservationRuns,
} from '../services/observations';

type Variables = {
  userEmail?: string;
};

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

// Helper to run a collection (used by both create and manual run)
async function runCollectionInternal(
  env: Env,
  db: D1Database,
  collectionId: string
): Promise<{
  success: boolean;
  error?: string;
  results?: Array<{ modelId: string; success: boolean; latencyMs?: number; error?: string }>;
}> {
  const collection = await getCollection(db, collectionId);
  if (!collection) {
    return { success: false, error: 'Collection not found' };
  }

  const modelIds = await getCollectionVersionModels(db, collectionId);
  if (modelIds.length === 0) {
    return { success: false, error: 'Collection has no models configured' };
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(db, 'collect');
  if (rateLimit.remaining < modelIds.length) {
    return {
      success: false,
      error: `Would exceed daily rate limit (requested: ${modelIds.length}, remaining: ${rateLimit.remaining})`,
    };
  }

  // Generate a prompt ID for this run
  const promptId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();

  // Run collection against all models in parallel
  const modelPromises = modelIds.map(async (modelId) => {
    const model = await getModel(db, modelId);
    if (!model) {
      return { modelId, success: false, error: 'Model not found' } as const;
    }

    let responseContent: string | null = null;
    let reasoningContent: string | null = null;
    let errorMsg: string | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const grounded = model.grounded === 1;
      const provider = createLLMProvider(model.id, model.provider, model.model_name, env, grounded);
      const start = Date.now();
      const response = await provider.complete({ prompt: collection.prompt_text });
      latencyMs = Date.now() - start;
      responseContent = response.content;
      reasoningContent = response.reasoningContent ?? null;
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    }

    // Calculate costs
    let inputCost: number | null = null;
    let outputCost: number | null = null;
    if (model.input_price_per_m !== null && inputTokens > 0) {
      inputCost = (inputTokens / 1_000_000) * model.input_price_per_m;
    }
    if (model.output_price_per_m !== null && outputTokens > 0) {
      outputCost = (outputTokens / 1_000_000) * model.output_price_per_m;
    }

    // Save to BigQuery with collection reference
    const bqRow: BigQueryRow = {
      id: crypto.randomUUID(),
      prompt_id: promptId,
      collected_at: collectedAt,
      source: 'collection',
      company: extractCompany(model.provider, model.model_name),
      product: extractProductFamily(model.model_name),
      model: model.model_name,
      topic_id: collection.topic_id,
      topic_name: collection.topic_name,
      prompt_template_id: collection.template_id,
      prompt_template_name: collection.template_name,
      prompt: collection.prompt_text,
      response: responseContent,
      reasoning_content: reasoningContent,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      error: errorMsg,
      success: !errorMsg,
      collection_id: collection.id,
      collection_version: collection.current_version,
    };
    insertRow(env, bqRow).catch((err) => {
      console.error('Failed to save collection response to BigQuery:', err);
    });

    return errorMsg
      ? ({ modelId, success: false, error: errorMsg } as const)
      : ({ modelId, success: true, latencyMs } as const);
  });

  const results = await Promise.all(modelPromises);

  // Update last_run_at
  await updateCollectionLastRunAt(db, collectionId);

  // Increment rate limit
  await incrementRateLimit(db, 'collect', results.length);

  return { success: true, results };
}

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

// Create a new topic (in D1 - required for collections foreign key)
api.post('/topics', async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    description?: string;
  }>();

  if (!body.id || !body.name) {
    return c.json({ error: 'id and name are required' }, 400);
  }

  // Check if topic already exists
  const existing = await getTopic(c.env.DB, body.id);
  if (existing) {
    return c.json({ topic: existing, created: false });
  }

  try {
    const topic = await createTopic(c.env.DB, body);
    return c.json({ topic, created: true }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create topic';
    return c.json({ error: message }, 500);
  }
});

// ==================== Tags ====================

// List all tags
api.get('/tags', async (c) => {
  const tags = await getTags(c.env.DB);
  return c.json({ tags });
});

// Create a tag
api.post('/tags', async (c) => {
  const body = await c.req.json<{ name: string; color?: string }>();

  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  try {
    const tag = await createTag(c.env.DB, body);
    return c.json({ tag }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create tag';
    if (message.includes('UNIQUE constraint')) {
      return c.json({ error: 'Tag with this name already exists' }, 409);
    }
    return c.json({ error: message }, 500);
  }
});

// Delete a tag
api.delete('/tags/:id', async (c) => {
  const { id } = c.req.param();
  const deleted = await deleteTag(c.env.DB, id);
  if (!deleted) {
    return c.json({ error: 'Tag not found' }, 404);
  }
  return c.json({ success: true });
});

// ==================== Prompt Lab History ====================

// Get recent prompts from Prompt Lab
api.get('/prompts', async (c) => {
  const limitParam = c.req.query('limit');
  const search = c.req.query('search');
  const modelsParam = c.req.query('models'); // comma-separated
  const companiesParam = c.req.query('companies'); // comma-separated
  const topicsParam = c.req.query('topics'); // comma-separated
  const sourcesParam = c.req.query('sources'); // comma-separated: 'collection', 'prompt-lab'
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  // Parse comma-separated values into arrays
  const models = modelsParam ? modelsParam.split(',').filter(Boolean) : undefined;
  const companies = companiesParam ? companiesParam.split(',').filter(Boolean) : undefined;
  const topics = topicsParam ? topicsParam.split(',').filter(Boolean) : undefined;
  const sources = sourcesParam ? sourcesParam.split(',').filter(Boolean) : undefined;

  const result = await getRecentPrompts(c.env, {
    limit,
    search: search || undefined,
    models,
    companies,
    topics,
    sources,
  });
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ prompts: result.data });
});

// ==================== Observations ====================

// Helper to run an observation (similar to runCollectionInternal)
async function runObservationInternal(
  env: Env,
  db: D1Database,
  observationId: string
): Promise<{
  success: boolean;
  error?: string;
  results?: Array<{ modelId: string; success: boolean; latencyMs?: number; error?: string; response?: string }>;
}> {
  const observation = await getObservation(db, observationId);
  if (!observation) {
    return { success: false, error: 'Observation not found' };
  }

  const modelIds = await getObservationVersionModels(db, observationId);
  if (modelIds.length === 0) {
    return { success: false, error: 'Observation has no models configured' };
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(db, 'collect');
  if (rateLimit.remaining < modelIds.length) {
    return {
      success: false,
      error: `Would exceed daily rate limit (requested: ${modelIds.length}, remaining: ${rateLimit.remaining})`,
    };
  }

  // Generate a prompt ID for this run
  const promptId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();

  // Run observation against all models in parallel
  const modelPromises = modelIds.map(async (modelId) => {
    const model = await getModel(db, modelId);
    if (!model) {
      return { modelId, success: false, error: 'Model not found' } as const;
    }

    let responseContent: string | null = null;
    let reasoningContent: string | null = null;
    let errorMsg: string | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const provider = createLLMProvider(model.id, model.provider, model.model_name, env);
      const start = Date.now();
      const response = await provider.complete({ prompt: observation.prompt_text });
      latencyMs = Date.now() - start;
      responseContent = response.content;
      reasoningContent = response.reasoningContent ?? null;
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    }

    // Calculate costs
    let inputCost: number | null = null;
    let outputCost: number | null = null;
    if (model.input_price_per_m !== null && inputTokens > 0) {
      inputCost = (inputTokens / 1_000_000) * model.input_price_per_m;
    }
    if (model.output_price_per_m !== null && outputTokens > 0) {
      outputCost = (outputTokens / 1_000_000) * model.output_price_per_m;
    }

    // Save to BigQuery with observation reference
    const bqRow: BigQueryRow = {
      id: crypto.randomUUID(),
      prompt_id: promptId,
      collected_at: collectedAt,
      source: 'observation',
      company: extractCompany(model.provider, model.model_name),
      product: extractProductFamily(model.model_name),
      model: model.model_name,
      topic_id: null,
      topic_name: null,
      prompt_template_id: null,
      prompt_template_name: null,
      prompt: observation.prompt_text,
      response: responseContent,
      reasoning_content: reasoningContent,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      error: errorMsg,
      success: !errorMsg,
      observation_id: observation.id,
      observation_version: observation.current_version,
    };
    insertRow(env, bqRow).then((result) => {
      if (!result.success) {
        console.error('Failed to save observation response to BigQuery:', result.error);
      }
    }).catch((err) => {
      console.error('BigQuery insert exception:', err);
    });

    return errorMsg
      ? ({ modelId, success: false, error: errorMsg } as const)
      : ({ modelId, success: true, latencyMs, response: responseContent ?? undefined } as const);
  });

  const results = await Promise.all(modelPromises);

  // Store results in D1 for immediate access (BigQuery has streaming delay)
  await createObservationRun(
    db,
    observationId,
    observation.current_version,
    results.map((r) => ({
      modelId: r.modelId,
      response: r.success ? r.response : undefined,
      error: r.success ? undefined : r.error,
      latencyMs: r.latencyMs ?? 0,
      success: r.success,
    }))
  );

  // Update last_run_at
  await updateObservationLastRunAt(db, observationId);

  // Increment rate limit
  await incrementRateLimit(db, 'collect', results.length);

  return { success: true, results };
}

// List all observations
api.get('/observations', async (c) => {
  const includeDisabledParam = c.req.query('includeDisabled');
  const includeDisabled = includeDisabledParam === 'true';
  const tagsParam = c.req.query('tags'); // comma-separated tag IDs
  const search = c.req.query('search');

  let observations = await getObservations(c.env.DB, { includeDisabled });

  // Fetch tags for each observation
  const observationsWithTags = await Promise.all(
    observations.map(async (obs) => {
      const tags = await getObservationTags(c.env.DB, obs.id);
      return { ...obs, tags };
    })
  );

  // Filter by tags if specified
  if (tagsParam) {
    const filterTagIds = tagsParam.split(',').filter(Boolean);
    observations = observationsWithTags.filter((obs) =>
      obs.tags?.some((tag) => filterTagIds.includes(tag.id))
    );
  }

  // Filter by search if specified
  if (search) {
    const searchLower = search.toLowerCase();
    observations = observationsWithTags.filter(
      (obs) =>
        obs.prompt_text.toLowerCase().includes(searchLower) ||
        (obs.display_name && obs.display_name.toLowerCase().includes(searchLower))
    );
  }

  return c.json({ observations: tagsParam || search ? observations : observationsWithTags });
});

// Get single observation with details
api.get('/observations/:id', async (c) => {
  const { id } = c.req.param();
  const observation = await getObservation(c.env.DB, id);
  if (!observation) {
    return c.json({ error: 'Observation not found' }, 404);
  }

  // Get models, tags, and versions for this observation
  const modelIds = await getObservationVersionModels(c.env.DB, id);
  const tags = await getObservationTags(c.env.DB, id);
  const versions = await getObservationVersions(c.env.DB, id);

  // Return models as objects with id property (for frontend compatibility)
  const models = modelIds.map((id) => ({ id }));

  return c.json({
    observation: {
      ...observation,
      models,
      tags,
      versions,
    },
  });
});

// Run a single model for an observation (used for progressive results)
async function runSingleModel(
  env: Env,
  db: D1Database,
  observation: { id: string; prompt_text: string; current_version: number },
  modelId: string,
  promptId: string,
  collectedAt: string
): Promise<{ modelId: string; success: boolean; latencyMs?: number; error?: string; response?: string }> {
  const model = await getModel(db, modelId);
  if (!model) {
    return { modelId, success: false, error: 'Model not found' };
  }

  let responseContent: string | null = null;
  let reasoningContent: string | null = null;
  let errorMsg: string | null = null;
  let latencyMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const provider = createLLMProvider(model.id, model.provider, model.model_name, env);
    const start = Date.now();
    const response = await provider.complete({ prompt: observation.prompt_text });
    latencyMs = Date.now() - start;
    responseContent = response.content;
    reasoningContent = response.reasoningContent ?? null;
    inputTokens = response.inputTokens ?? 0;
    outputTokens = response.outputTokens ?? 0;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Unknown error';
  }

  // Calculate costs
  let inputCost: number | null = null;
  let outputCost: number | null = null;
  if (model.input_price_per_m !== null && inputTokens > 0) {
    inputCost = (inputTokens / 1_000_000) * model.input_price_per_m;
  }
  if (model.output_price_per_m !== null && outputTokens > 0) {
    outputCost = (outputTokens / 1_000_000) * model.output_price_per_m;
  }

  // Save to BigQuery
  const bqRow: BigQueryRow = {
    id: crypto.randomUUID(),
    prompt_id: promptId,
    collected_at: collectedAt,
    source: 'observation',
    company: extractCompany(model.provider, model.model_name),
    product: extractProductFamily(model.model_name),
    model: model.model_name,
    topic_id: null,
    topic_name: null,
    prompt_template_id: null,
    prompt_template_name: null,
    prompt: observation.prompt_text,
    response: responseContent,
    reasoning_content: reasoningContent,
    latency_ms: latencyMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    input_cost: inputCost,
    output_cost: outputCost,
    error: errorMsg,
    success: !errorMsg,
    observation_id: observation.id,
    observation_version: observation.current_version,
  };
  insertRow(env, bqRow).catch((err) => {
    console.error('BigQuery insert exception:', err);
  });

  return errorMsg
    ? { modelId, success: false, error: errorMsg }
    : { modelId, success: true, latencyMs, response: responseContent ?? undefined };
}

// Create new observation and stream results as each model completes (requires API key)
api.post('/observations/stream', async (c) => {
  // Validate Bearer token
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Server configuration error: ADMIN_API_KEY not set' }, 500);
  }

  if (!token) {
    return c.json({ error: 'Missing API key - provide Authorization: Bearer <key> header' }, 401);
  }

  if (token !== c.env.ADMIN_API_KEY.trim()) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  const body = await c.req.json<{
    prompt_text: string;
    display_name?: string;
    model_ids: string[];
    tag_ids?: string[];
    word_limit?: number;
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
  }>();

  if (!body.prompt_text || !body.model_ids?.length) {
    return c.json({ error: 'prompt_text and model_ids are required' }, 400);
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(c.env.DB, 'collect');
  if (rateLimit.remaining < body.model_ids.length) {
    return c.json({
      error: `Would exceed daily rate limit (requested: ${body.model_ids.length}, remaining: ${rateLimit.remaining})`,
    }, 429);
  }

  // Apply word limit if specified
  let promptText = body.prompt_text;
  if (body.word_limit && body.word_limit > 0) {
    promptText = `${promptText}\n\nLimit your response to ${body.word_limit} words.`;
  }

  // Create observation first
  const { observation } = await createObservation(c.env.DB, {
    prompt_text: promptText,
    display_name: body.display_name,
    model_ids: body.model_ids,
    tag_ids: body.tag_ids,
    schedule_type: body.schedule_type,
    cron_expression: body.cron_expression,
  });

  const promptId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();
  const modelIds = body.model_ids;

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send observation created event first
      const obsEvent = `data: ${JSON.stringify({ type: 'observation', observation: { id: observation.id } })}\n\n`;
      controller.enqueue(encoder.encode(obsEvent));

      // Collect all results for D1 storage
      const allResults: Array<{ modelId: string; response?: string; error?: string; latencyMs: number; success: boolean }> = [];

      // Run each model and stream results as they complete
      const modelPromises = modelIds.map(async (modelId) => {
        const result = await runSingleModel(
          c.env,
          c.env.DB,
          { id: observation.id, prompt_text: promptText, current_version: 1 },
          modelId,
          promptId,
          collectedAt
        );

        // Store for D1
        allResults.push({
          modelId: result.modelId,
          response: result.response,
          error: result.error,
          latencyMs: result.latencyMs ?? 0,
          success: result.success,
        });

        // Stream this result immediately
        const resultEvent = `data: ${JSON.stringify({ type: 'result', result })}\n\n`;
        controller.enqueue(encoder.encode(resultEvent));

        return result;
      });

      // Wait for all to complete
      await Promise.all(modelPromises);

      // Store all results in D1
      await createObservationRun(c.env.DB, observation.id, 1, allResults);
      await updateObservationLastRunAt(c.env.DB, observation.id);
      await incrementRateLimit(c.env.DB, 'collect', modelIds.length);

      // Send done event
      const doneEvent = `data: ${JSON.stringify({ type: 'done' })}\n\n`;
      controller.enqueue(encoder.encode(doneEvent));

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Create new observation and run immediately (requires API key)
api.post('/observations', async (c) => {
  // Validate Bearer token
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // Check if ADMIN_API_KEY is configured
  if (!c.env.ADMIN_API_KEY) {
    console.error('ADMIN_API_KEY secret is not configured');
    return c.json({ error: 'Server configuration error: ADMIN_API_KEY not set' }, 500);
  }

  if (!token) {
    return c.json({ error: 'Missing API key - provide Authorization: Bearer <key> header' }, 401);
  }

  if (token !== c.env.ADMIN_API_KEY.trim()) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  const body = await c.req.json<{
    prompt_text: string;
    display_name?: string;
    model_ids: string[];
    tag_ids?: string[];
    word_limit?: number;
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
  }>();

  if (!body.prompt_text || !body.model_ids?.length) {
    return c.json({ error: 'prompt_text and model_ids are required' }, 400);
  }

  // Apply word limit if specified
  let promptText = body.prompt_text;
  if (body.word_limit && body.word_limit > 0) {
    promptText = `${promptText}\n\nLimit your response to ${body.word_limit} words.`;
  }

  try {
    const { observation } = await createObservation(c.env.DB, {
      prompt_text: promptText,
      display_name: body.display_name,
      model_ids: body.model_ids,
      tag_ids: body.tag_ids,
      schedule_type: body.schedule_type,
      cron_expression: body.cron_expression,
    });

    // Run observation immediately and wait for results
    const runResult = await runObservationInternal(c.env, c.env.DB, observation.id);

    const observationWithDetails = await getObservation(c.env.DB, observation.id);
    const tags = await getObservationTags(c.env.DB, observation.id);
    const modelIds = await getObservationVersionModels(c.env.DB, observation.id);

    return c.json(
      {
        observation: {
          ...observationWithDetails,
          tags,
          models: modelIds.map((id) => ({ id })),
        },
        results: runResult.results,
        created: true,
      },
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create observation';
    console.error('Observation creation failed:', err);
    return c.json({ error: message }, 500);
  }
});

// Update observation (creates new version if models/schedule change) - requires API key
api.put('/observations/:id', async (c) => {
  // Validate Bearer token
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!c.env.ADMIN_API_KEY) {
    console.error('ADMIN_API_KEY secret is not configured');
    return c.json({ error: 'Server configuration error: ADMIN_API_KEY not set' }, 500);
  }

  if (!token) {
    return c.json({ error: 'Missing API key - provide Authorization: Bearer <key> header' }, 401);
  }

  if (token !== c.env.ADMIN_API_KEY.trim()) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    display_name?: string;
    model_ids?: string[];
    tag_ids?: string[];
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
    is_paused?: boolean;
  }>();

  const { observation, new_version } = await updateObservation(c.env.DB, id, body);
  if (!observation) {
    return c.json({ error: 'Observation not found' }, 404);
  }

  // Get tags for response
  const tags = await getObservationTags(c.env.DB, id);

  return c.json({ observation: { ...observation, tags }, new_version });
});

// Delete observation (soft-delete: sets disabled flag)
api.delete('/observations/:id', async (c) => {
  const { id } = c.req.param();
  const deleted = await deleteObservation(c.env.DB, id);
  if (!deleted) {
    return c.json({ error: 'Observation not found' }, 404);
  }
  return c.json({ success: true });
});

// Restore a disabled observation
api.put('/observations/:id/restore', async (c) => {
  const { id } = c.req.param();
  const restored = await restoreObservation(c.env.DB, id);
  if (!restored) {
    return c.json({ error: 'Observation not found' }, 404);
  }
  return c.json({ success: true });
});

// Get responses for a specific observation (from BigQuery)
api.get('/observations/:id/responses', async (c) => {
  const { id } = c.req.param();
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  // Verify observation exists
  const observation = await getObservation(c.env.DB, id);
  if (!observation) {
    return c.json({ error: 'Observation not found' }, 404);
  }

  // Get runs from D1 (immediate, no BigQuery streaming delay)
  const runs = await getObservationRuns(c.env.DB, id, limit);

  // Transform to match expected format
  const prompts = runs.map((run) => ({
    group_id: run.id,
    prompt: observation.prompt_text,
    collected_at: run.run_at,
    source: 'observation',
    responses: run.results.map((r) => ({
      id: r.id,
      model: r.model_name ?? r.model_id,
      company: r.company ?? '',
      response: r.response,
      latency_ms: r.latency_ms,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      error: r.error,
      success: r.success === 1,
    })),
  }));

  return c.json({ prompts });
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
// By default, filters out non-text models. Use ?includeNonText=true to include all models.
api.get('/models', async (c) => {
  const includeNonText = c.req.query('includeNonText') === 'true';
  const models = await getModels(c.env.DB);

  // Filter to text-only models unless includeNonText is true
  // A model is text-capable if output_modalities is null (backwards compat) or contains "text"
  const filteredModels = includeNonText
    ? models
    : models.filter((m) => {
        if (m.output_modalities === null) return true;
        try {
          const modalities = JSON.parse(m.output_modalities) as string[];
          return modalities.includes('text');
        } catch {
          // If parsing fails, include the model (backwards compat)
          return true;
        }
      });

  // Add computed company field (actual creator, not hosting provider)
  const modelsWithCompany = filteredModels.map((m) => ({
    ...m,
    company: extractCompany(m.provider, m.model_name),
  }));
  return c.json({ models: modelsWithCompany });
});

// ==================== Collections ====================

// List all collections
api.get('/collections', async (c) => {
  const includeDisabledParam = c.req.query('includeDisabled');
  const includeDisabled = includeDisabledParam !== 'false'; // Include by default
  const collections = await getCollections(c.env.DB, { includeDisabled });
  return c.json({ collections });
});

// Get single collection with details
api.get('/collections/:id', async (c) => {
  const { id } = c.req.param();
  const collection = await getCollection(c.env.DB, id);
  if (!collection) {
    return c.json({ error: 'Collection not found' }, 404);
  }

  // Get models and versions for this collection
  const modelIds = await getCollectionVersionModels(c.env.DB, id);
  const versions = await getCollectionVersions(c.env.DB, id);

  // Return models as objects with id property (for frontend compatibility)
  const models = modelIds.map((id) => ({ id }));

  return c.json({
    collection: {
      ...collection,
      models,
      versions,
    },
  });
});

// Get responses for a collection
api.get('/collections/:id/responses', async (c) => {
  const { id } = c.req.param();
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  // Verify collection exists
  const collection = await getCollection(c.env.DB, id);
  if (!collection) {
    return c.json({ error: 'Collection not found' }, 404);
  }

  // Get responses from BigQuery
  const result = await getCollectionResponses(c.env, id, { limit });
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ prompts: result.data });
});

// Create new collection (or return existing if topic+template match)
api.post('/collections', async (c) => {
  const body = await c.req.json<{
    topic_id: string;
    template_id: string;
    model_ids: string[];
    display_name?: string;
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
  }>();

  if (!body.topic_id || !body.template_id || !body.model_ids?.length) {
    return c.json({ error: 'topic_id, template_id, and model_ids are required' }, 400);
  }

  // Check if collection already exists for this topic+template
  const existing = await getCollectionByTopicAndTemplate(c.env.DB, body.topic_id, body.template_id);
  if (existing) {
    const collection = await getCollection(c.env.DB, existing.id);
    return c.json({ collection, created: false });
  }

  // Get the prompt template to render the prompt text
  const template = await getPromptTemplate(c.env.DB, body.template_id);
  if (!template) {
    return c.json({ error: 'Prompt template not found' }, 404);
  }

  // Get the topic name for rendering (topics may be in D1 or just passed as ID)
  // For now, use topic_id as the topic name if no topic exists
  const topic = await getTopic(c.env.DB, body.topic_id);
  const topicName = topic?.name ?? body.topic_id;

  // Render the prompt text
  const promptText = template.template.replace(/\{topic\}/gi, topicName);

  try {
    const { collection } = await createCollection(c.env.DB, {
      topic_id: body.topic_id,
      template_id: body.template_id,
      prompt_text: promptText,
      display_name: body.display_name,
      model_ids: body.model_ids,
      schedule_type: body.schedule_type,
      cron_expression: body.cron_expression,
    });

    // Run collection immediately (fire and forget - don't block response)
    // This ensures the user sees initial responses right away
    runCollectionInternal(c.env, c.env.DB, collection.id).catch((err) => {
      console.error('Failed to run collection immediately:', err);
    });

    const collectionWithDetails = await getCollection(c.env.DB, collection.id);
    return c.json({ collection: collectionWithDetails, created: true }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create collection';
    console.error('Collection creation failed:', err);
    return c.json({ error: message }, 500);
  }
});

// Update collection (creates new version if models/schedule change)
api.put('/collections/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    display_name?: string;
    model_ids?: string[];
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
    is_paused?: boolean;
  }>();

  const { collection, new_version } = await updateCollection(c.env.DB, id, body);
  if (!collection) {
    return c.json({ error: 'Collection not found' }, 404);
  }

  return c.json({ collection, new_version });
});

// Delete collection (soft-delete: sets disabled flag)
api.delete('/collections/:id', async (c) => {
  const { id } = c.req.param();
  const deleted = await deleteCollection(c.env.DB, id);
  if (!deleted) {
    return c.json({ error: 'Collection not found' }, 404);
  }
  return c.json({ success: true });
});

// Restore a disabled collection
api.put('/collections/:id/restore', async (c) => {
  const { id } = c.req.param();
  const restored = await restoreCollection(c.env.DB, id);
  if (!restored) {
    return c.json({ error: 'Collection not found' }, 404);
  }
  return c.json({ success: true });
});

// ==================== Admin Routes (Protected by Cloudflare Access) ====================

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
      const grounded = model.grounded === 1;
      const provider = createLLMProvider(model.id, model.provider, model.model_name, c.env, grounded);
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

// Trigger model sync from provider APIs
admin.post('/sync-models', async (c) => {
  const results = await syncAllProviders(c.env);
  return c.json({ results });
});

// Trigger basellm metadata sync (release dates, knowledge cutoff)
admin.post('/sync-basellm', async (c) => {
  const result = await syncBasellmMetadata(c.env);
  return c.json({ result });
});

// Get recent sync logs
admin.get('/sync-log', async (c) => {
  const logs = await getModelSyncLogs(c.env.DB);
  return c.json({ logs });
});

// Run a collection manually (protected + rate limited)
admin.post('/collections/:id/run', async (c) => {
  const { id } = c.req.param();

  const result = await runCollectionInternal(c.env, c.env.DB, id);
  if (!result.success) {
    const status = result.error?.includes('not found') ? 404 : result.error?.includes('rate limit') ? 429 : 400;
    return c.json({ error: result.error }, status);
  }

  return c.json({
    collection_id: id,
    results: result.results,
    successful: result.results?.filter((r) => r.success).length ?? 0,
    failed: result.results?.filter((r) => !r.success).length ?? 0,
  });
});

// Run an observation manually (protected + rate limited)
admin.post('/observations/:id/run', async (c) => {
  const { id } = c.req.param();

  const result = await runObservationInternal(c.env, c.env.DB, id);
  if (!result.success) {
    const status = result.error?.includes('not found') ? 404 : result.error?.includes('rate limit') ? 429 : 400;
    return c.json({ error: result.error }, status);
  }

  return c.json({
    observation_id: id,
    results: result.results,
    successful: result.results?.filter((r) => r.success).length ?? 0,
    failed: result.results?.filter((r) => !r.success).length ?? 0,
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
      const grounded = model.grounded === 1;
      const provider = createLLMProvider(model.id, model.provider, model.model_name, c.env, grounded);
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

    // Calculate costs based on model pricing
    let inputCost: number | null = null;
    let outputCost: number | null = null;
    if (model.input_price_per_m !== null && inputTokens > 0) {
      inputCost = (inputTokens / 1_000_000) * model.input_price_per_m;
    }
    if (model.output_price_per_m !== null && outputTokens > 0) {
      outputCost = (outputTokens / 1_000_000) * model.output_price_per_m;
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
      reasoning_content: null,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
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
