import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { api } from './routes/api';
import { syncAllProviders } from './services/model-sync';
import { syncBasellmMetadata } from './services/basellm';
import { runScheduledCollections } from './services/collection-scheduler';
import { runScheduledObservations } from './services/observation-scheduler';

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
    const scheduledTime = new Date(event.scheduledTime);
    const hour = scheduledTime.getUTCHours();
    const minute = scheduledTime.getUTCMinutes();

    // Model sync runs once at 6:00 AM UTC (hour=6, minute=0)
    if (hour === 6 && minute === 0) {
      ctx.waitUntil(fullModelSync(env));
    }

    // Collection scheduler runs every minute (checks cron expressions)
    ctx.waitUntil(
      runScheduledCollections(env).then((result) => {
        if (result.ran > 0) {
          console.log(`Scheduled collections: ran ${result.ran} of ${result.checked} collections`);
        }
      })
    );

    // Observation scheduler runs every minute (checks cron expressions)
    ctx.waitUntil(
      runScheduledObservations(env).then((result) => {
        if (result.ran > 0) {
          console.log(`Scheduled observations: ran ${result.ran} of ${result.checked} observations`);
        }
      })
    );
  },
};
