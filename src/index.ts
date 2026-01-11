import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { api } from './routes/api';
import { syncAllProviders } from './services/model-sync';
import { syncBasellmMetadata } from './services/basellm';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('*', cors());

// Mount API routes
app.route('/api', api);

// Serve frontend for all other routes
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// Full sync: provider models + basellm metadata enrichment
async function fullModelSync(env: Env) {
  // First sync models from provider APIs
  await syncAllProviders(env);
  // Then enrich with basellm metadata (release dates, knowledge cutoff)
  await syncBasellmMetadata(env);
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(fullModelSync(env));
  },
};
