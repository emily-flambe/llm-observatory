/**
 * SwarmSchedulerDO - Durable Object for swarm scheduling deduplication
 *
 * This DO provides strong consistency guarantees for claiming swarm executions.
 * Unlike D1 which has eventual consistency across regions, a Durable Object
 * routes all requests to a single instance, ensuring atomic operations.
 *
 * Each claim is stored with key format: "{swarmId}:{minute}" where minute
 * is truncated to "YYYY-MM-DDTHH:MM" format.
 */

import { DurableObject } from 'cloudflare:workers';

interface ClaimRecord {
  claimedAt: string;
  workerId: string;
}

export class SwarmSchedulerDO extends DurableObject<Env> {
  /**
   * Attempt to claim a swarm execution for a specific minute.
   * Returns true if this caller successfully claimed, false if already claimed.
   */
  async claimExecution(swarmId: string, scheduledMinute: string): Promise<boolean> {
    const key = `${swarmId}:${scheduledMinute}`;

    // Check if already claimed
    const existing = await this.ctx.storage.get<ClaimRecord>(key);
    if (existing) {
      return false;
    }

    // Claim it
    const claim: ClaimRecord = {
      claimedAt: new Date().toISOString(),
      workerId: crypto.randomUUID(),
    };
    await this.ctx.storage.put(key, claim);

    return true;
  }

  /**
   * Check if a swarm execution is already claimed for a specific minute.
   */
  async isClaimExists(swarmId: string, scheduledMinute: string): Promise<boolean> {
    const key = `${swarmId}:${scheduledMinute}`;
    const existing = await this.ctx.storage.get<ClaimRecord>(key);
    return existing !== undefined;
  }

  /**
   * Clean up claims older than the specified cutoff.
   * Returns the number of claims deleted.
   */
  async cleanupOldClaims(olderThanMinute: string): Promise<number> {
    const allKeys = await this.ctx.storage.list<ClaimRecord>();
    let deleted = 0;

    for (const [key] of allKeys) {
      // Key format is "{swarmId}:{minute}", extract the minute part
      const parts = key.split(':');
      if (parts.length >= 2) {
        // Reconstruct the minute (in case swarmId contains colons, take last part)
        const minute = parts[parts.length - 1];
        if (minute < olderThanMinute) {
          await this.ctx.storage.delete(key);
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Get statistics about stored claims (for debugging/monitoring)
   */
  async getStats(): Promise<{ totalClaims: number; oldestClaim: string | null }> {
    const allKeys = await this.ctx.storage.list<ClaimRecord>();
    let oldest: string | null = null;

    for (const [key] of allKeys) {
      const parts = key.split(':');
      if (parts.length >= 2) {
        const minute = parts[parts.length - 1];
        if (!oldest || minute < oldest) {
          oldest = minute;
        }
      }
    }

    return {
      totalClaims: allKeys.size,
      oldestClaim: oldest,
    };
  }

  /**
   * Handle HTTP requests to the Durable Object.
   * This allows the DO to be called via fetch from the worker.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/claim' && request.method === 'POST') {
        const body = await request.json() as { swarmId: string; scheduledMinute: string };
        const claimed = await this.claimExecution(body.swarmId, body.scheduledMinute);
        return Response.json({ claimed });
      }

      if (path === '/check' && request.method === 'POST') {
        const body = await request.json() as { swarmId: string; scheduledMinute: string };
        const exists = await this.isClaimExists(body.swarmId, body.scheduledMinute);
        return Response.json({ exists });
      }

      if (path === '/cleanup' && request.method === 'POST') {
        const body = await request.json() as { olderThanMinute: string };
        const deleted = await this.cleanupOldClaims(body.olderThanMinute);
        return Response.json({ deleted });
      }

      if (path === '/stats' && request.method === 'GET') {
        const stats = await this.getStats();
        return Response.json(stats);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Response.json({ error: message }, { status: 500 });
    }
  }
}

// Type for the DO namespace binding
export type SwarmSchedulerDONamespace = DurableObjectNamespace<SwarmSchedulerDO>;

/**
 * Helper function to get the singleton DO instance.
 * We use a fixed ID so all requests go to the same instance.
 */
export function getSchedulerDO(namespace: SwarmSchedulerDONamespace): DurableObjectStub<SwarmSchedulerDO> {
  // Use a fixed ID for singleton pattern - all scheduling goes through one instance
  const id = namespace.idFromName('swarm-scheduler');
  return namespace.get(id);
}

/**
 * Truncate a Date to minute precision for claim keys.
 * Returns format: "YYYY-MM-DDTHH:MM"
 */
export function truncateToMinute(date: Date): string {
  return date.toISOString().slice(0, 16);
}

// Re-export for convenience
interface Env {
  SWARM_SCHEDULER: SwarmSchedulerDONamespace;
}
