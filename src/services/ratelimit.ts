/**
 * Simple daily rate limiter using D1
 *
 * Limits:
 * - collect: 100 requests/day (each model counts as 1)
 * - prompt: 50 requests/day
 */

const DAILY_LIMITS: Record<string, number> = {
  collect: 100,
  prompt: 50,
};

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

export async function checkRateLimit(
  db: D1Database,
  endpoint: string
): Promise<RateLimitResult> {
  const today = getToday();
  const limit = DAILY_LIMITS[endpoint] ?? 100;

  const row = await db
    .prepare('SELECT request_count FROM rate_limits WHERE date = ? AND endpoint = ?')
    .bind(today, endpoint)
    .first<{ request_count: number }>();

  const current = row?.request_count ?? 0;

  return {
    allowed: current < limit,
    current,
    limit,
    remaining: Math.max(0, limit - current),
  };
}

export async function incrementRateLimit(
  db: D1Database,
  endpoint: string,
  count: number = 1
): Promise<void> {
  const today = getToday();

  await db
    .prepare(
      `INSERT INTO rate_limits (date, endpoint, request_count)
       VALUES (?, ?, ?)
       ON CONFLICT (date, endpoint)
       DO UPDATE SET request_count = request_count + ?`
    )
    .bind(today, endpoint, count, count)
    .run();
}

export async function getRateLimitStatus(
  db: D1Database
): Promise<Record<string, RateLimitResult>> {
  const result: Record<string, RateLimitResult> = {};

  for (const endpoint of Object.keys(DAILY_LIMITS)) {
    result[endpoint] = await checkRateLimit(db, endpoint);
  }

  return result;
}
