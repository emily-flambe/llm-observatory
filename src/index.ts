import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { api } from './routes/api';
// Kept for Cloudflare DO compatibility - does nothing (scheduling moved to Dagster)
import { SwarmSchedulerDO } from './services/scheduler-do';
export { SwarmSchedulerDO };

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('*', cors());

// Mount API routes
app.route('/api', api);

// Serve frontend for all other routes
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
};
