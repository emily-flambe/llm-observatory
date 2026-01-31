/**
 * SwarmSchedulerDO - DEPRECATED
 *
 * Scheduling has moved to Dagster. This class is kept only because
 * Cloudflare requires it to exist for the migration. It does nothing.
 */

import { DurableObject } from 'cloudflare:workers';

export class SwarmSchedulerDO extends DurableObject {
  async fetch(): Promise<Response> {
    return new Response('Scheduling moved to Dagster', { status: 410 });
  }
}
