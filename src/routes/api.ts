import { Hono } from 'hono';
import type { Env } from '../types/env';
import { getTopics, getTopic, getModels } from '../services/storage';
import { collectForTopic } from '../services/collector';
import { queryResponses } from '../services/bigquery';

const api = new Hono<{ Bindings: Env }>();

// Health check
api.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// List all topics
api.get('/topics', async (c) => {
  const topics = await getTopics(c.env.DB);
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

// List all models
api.get('/models', async (c) => {
  const models = await getModels(c.env.DB);
  return c.json({ models });
});

// Admin: Trigger collection (protected)
api.post('/admin/collect', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.ADMIN_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ topicId: string; modelId: string }>();

  if (!body.topicId || !body.modelId) {
    return c.json({ error: 'topicId and modelId are required' }, 400);
  }

  const result = await collectForTopic(body.topicId, body.modelId, c.env);

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

// Admin: Collect all combinations (protected)
api.post('/admin/collect-all', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.ADMIN_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const topics = await getTopics(c.env.DB);
  const models = await getModels(c.env.DB);

  const results: Array<{ topicId: string; modelId: string; success: boolean; error?: string }> = [];

  for (const topic of topics) {
    for (const model of models) {
      const result = await collectForTopic(topic.id, model.id, c.env);
      results.push({
        topicId: topic.id,
        modelId: model.id,
        success: result.success,
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

export { api };
