import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { api } from './routes/api';
import { syncAllProviders } from './services/model-sync';
import { syncBasellmMetadata } from './services/basellm';
import { runScheduledCollections } from './services/collection-scheduler';
import { runScheduledSwarms } from './services/swarm-scheduler';
import { cleanupOldScheduledRunClaims } from './services/swarms';
import { SwarmSchedulerDO, getSchedulerDO, truncateToMinute } from './services/scheduler-do';

// Export Durable Object class for Cloudflare
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

    // Daily maintenance at 6:00 AM UTC (hour=6, minute=0)
    if (hour === 6 && minute === 0) {
      ctx.waitUntil(fullModelSync(env));
      // Clean up old scheduled run claims from D1 (older than 7 days)
      ctx.waitUntil(
        cleanupOldScheduledRunClaims(env.DB).then((deleted) => {
          if (deleted > 0) {
            console.log(`Cleaned up ${deleted} old D1 scheduled run claims`);
          }
        })
      );
      // Clean up old claims from Durable Object (older than 1 hour)
      ctx.waitUntil(
        (async () => {
          const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
          const scheduler = getSchedulerDO(env.SWARM_SCHEDULER);
          const deleted = await scheduler.cleanupOldClaims(truncateToMinute(cutoff));
          if (deleted > 0) {
            console.log(`Cleaned up ${deleted} old DO scheduled run claims`);
          }
        })()
      );
    }

    // Collection scheduler runs every minute (checks cron expressions)
    // Pass scheduledTime to ensure cron matching uses the trigger time, not execution time
    ctx.waitUntil(
      runScheduledCollections(env, scheduledTime).then((result) => {
        if (result.ran > 0) {
          console.log(`Scheduled collections: ran ${result.ran} of ${result.checked} collections`);
        }
      })
    );

    // Swarm scheduler runs every minute (checks cron expressions)
    // Pass scheduledTime to ensure cron matching uses the trigger time, not execution time
    ctx.waitUntil(
      runScheduledSwarms(env, scheduledTime).then((result) => {
        if (result.ran > 0) {
          console.log(`Scheduled swarms: ran ${result.ran} of ${result.checked} swarms`);
        }
      })
    );
  },
};
