// D1 storage for swarms (unified prompt management)
// Swarms replace collections as the primary way to save and schedule prompts

export interface Swarm {
  id: string;
  prompt_text: string;
  display_name: string | null;
  disabled: number;
  hide_from_history: number;
  created_at: string;
  last_run_at: string | null;
}

export interface SwarmVersion {
  id: string;
  swarm_id: string;
  version: number;
  schedule_type: string | null;
  cron_expression: string | null;
  is_paused: number;
  created_at: string;
}

export interface SwarmWithDetails extends Swarm {
  current_version: number;
  schedule_type: string | null;
  cron_expression: string | null;
  is_paused: number;
  model_count: number;
  tags?: Array<{ id: string; name: string; color: string | null }>;
  hide_from_history: number;
}

export interface SwarmTag {
  id: string;
  name: string;
  color: string | null;
}

export interface CreateSwarmInput {
  prompt_text: string;
  display_name?: string;
  model_ids: string[];
  tag_ids?: string[];
  schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression?: string | null;
}

export interface UpdateSwarmInput {
  display_name?: string;
  model_ids?: string[];
  tag_ids?: string[];
  schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression?: string | null;
  is_paused?: boolean;
  hide_from_history?: boolean;
}

/**
 * Create a new swarm with initial version and model associations
 */
export async function createSwarm(
  db: D1Database,
  input: CreateSwarmInput
): Promise<{ swarm: Swarm; version: SwarmVersion }> {
  const swarmId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create swarm (DB table still named 'observations')
  await db
    .prepare(
      'INSERT INTO observations (id, prompt_text, display_name, created_at) VALUES (?, ?, ?, ?)'
    )
    .bind(swarmId, input.prompt_text, input.display_name ?? null, now)
    .run();

  // Create initial version (version 1, with optional schedule)
  await db
    .prepare(
      'INSERT INTO observation_versions (id, observation_id, version, schedule_type, cron_expression, is_paused, created_at) VALUES (?, ?, 1, ?, ?, 0, ?)'
    )
    .bind(
      versionId,
      swarmId,
      input.schedule_type ?? null,
      input.cron_expression ?? null,
      now
    )
    .run();

  // Add models to version
  for (const modelId of input.model_ids) {
    await db
      .prepare(
        'INSERT INTO observation_version_models (observation_version_id, model_id) VALUES (?, ?)'
      )
      .bind(versionId, modelId)
      .run();
  }

  // Add tags to swarm
  if (input.tag_ids && input.tag_ids.length > 0) {
    for (const tagId of input.tag_ids) {
      await db
        .prepare('INSERT INTO observation_tags (observation_id, tag_id) VALUES (?, ?)')
        .bind(swarmId, tagId)
        .run();
    }
  }

  const createdSwarm: Swarm = {
    id: swarmId,
    prompt_text: input.prompt_text,
    display_name: input.display_name ?? null,
    disabled: 0,
    hide_from_history: 0,
    created_at: now,
    last_run_at: null,
  };

  const createdVersion: SwarmVersion = {
    id: versionId,
    swarm_id: swarmId,
    version: 1,
    schedule_type: input.schedule_type ?? null,
    cron_expression: input.cron_expression ?? null,
    is_paused: 0,
    created_at: now,
  };

  return { swarm: createdSwarm, version: createdVersion };
}

/**
 * Get a single swarm with current version details and model count
 */
export async function getSwarm(
  db: D1Database,
  id: string
): Promise<SwarmWithDetails | null> {
  const result = await db
    .prepare(
      `
      SELECT
        o.id, o.prompt_text, o.display_name, o.disabled, o.hide_from_history, o.created_at, o.last_run_at,
        ov.version as current_version, ov.schedule_type, ov.cron_expression, ov.is_paused,
        (SELECT COUNT(*) FROM observation_version_models ovm WHERE ovm.observation_version_id = ov.id) as model_count
      FROM observations o
      LEFT JOIN observation_versions ov ON ov.observation_id = o.id
        AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = o.id)
      WHERE o.id = ?
    `
    )
    .bind(id)
    .first<SwarmWithDetails>();
  return result ?? null;
}

/**
 * Get all swarms with current version details
 */
export async function getSwarms(
  db: D1Database,
  options: { includeDisabled?: boolean } = {}
): Promise<SwarmWithDetails[]> {
  const { includeDisabled = false } = options;
  const whereClause = includeDisabled ? '' : 'WHERE o.disabled = 0';
  const result = await db
    .prepare(
      `
      SELECT
        o.id, o.prompt_text, o.display_name, o.disabled, o.hide_from_history, o.created_at, o.last_run_at,
        ov.version as current_version, ov.schedule_type, ov.cron_expression, ov.is_paused,
        (SELECT COUNT(*) FROM observation_version_models ovm WHERE ovm.observation_version_id = ov.id) as model_count
      FROM observations o
      LEFT JOIN observation_versions ov ON ov.observation_id = o.id
        AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = o.id)
      ${whereClause}
      ORDER BY o.created_at DESC
    `
    )
    .all<SwarmWithDetails>();
  return result.results;
}

/**
 * Get model IDs for the current version of a swarm
 */
export async function getSwarmVersionModels(
  db: D1Database,
  swarmId: string
): Promise<string[]> {
  const result = await db
    .prepare(
      `
      SELECT ovm.model_id
      FROM observation_version_models ovm
      JOIN observation_versions ov ON ov.id = ovm.observation_version_id
      WHERE ov.observation_id = ?
        AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = ?)
    `
    )
    .bind(swarmId, swarmId)
    .all<{ model_id: string }>();
  return result.results.map((r) => r.model_id);
}

/**
 * Get tags for a swarm
 */
export async function getSwarmTags(
  db: D1Database,
  swarmId: string
): Promise<SwarmTag[]> {
  const result = await db
    .prepare(
      `
      SELECT t.id, t.name, t.color
      FROM tags t
      JOIN observation_tags ot ON ot.tag_id = t.id
      WHERE ot.observation_id = ?
      ORDER BY t.name
    `
    )
    .bind(swarmId)
    .all<SwarmTag>();
  return result.results;
}

/**
 * Get all versions for a swarm
 */
export async function getSwarmVersions(
  db: D1Database,
  swarmId: string
): Promise<SwarmVersion[]> {
  const result = await db
    .prepare('SELECT id, observation_id as swarm_id, version, schedule_type, cron_expression, is_paused, created_at FROM observation_versions WHERE observation_id = ? ORDER BY version DESC')
    .bind(swarmId)
    .all<SwarmVersion>();
  return result.results;
}

/**
 * Update a swarm. Creates a new version if models or schedule change.
 */
export async function updateSwarm(
  db: D1Database,
  id: string,
  updates: UpdateSwarmInput
): Promise<{ swarm: SwarmWithDetails | null; new_version: boolean }> {
  const swarm = await getSwarm(db, id);
  if (!swarm) {
    return { swarm: null, new_version: false };
  }

  // Update display_name on swarm if provided
  if (updates.display_name !== undefined) {
    await db
      .prepare('UPDATE observations SET display_name = ? WHERE id = ?')
      .bind(updates.display_name, id)
      .run();
  }

  // Update hide_from_history flag if provided
  if (updates.hide_from_history !== undefined) {
    await db
      .prepare('UPDATE observations SET hide_from_history = ? WHERE id = ?')
      .bind(updates.hide_from_history ? 1 : 0, id)
      .run();
  }

  // Update tags if provided
  if (updates.tag_ids !== undefined) {
    // Remove existing tags
    await db.prepare('DELETE FROM observation_tags WHERE observation_id = ?').bind(id).run();
    // Add new tags
    for (const tagId of updates.tag_ids) {
      await db
        .prepare('INSERT INTO observation_tags (observation_id, tag_id) VALUES (?, ?)')
        .bind(id, tagId)
        .run();
    }
  }

  // Check if we need a new version (models or schedule changed)
  const currentModels = await getSwarmVersionModels(db, id);
  const modelsChanged =
    updates.model_ids !== undefined &&
    (updates.model_ids.length !== currentModels.length ||
      !updates.model_ids.every((m) => currentModels.includes(m)));

  const scheduleChanged =
    updates.schedule_type !== undefined ||
    updates.cron_expression !== undefined ||
    updates.is_paused !== undefined;

  let newVersion = false;

  if (modelsChanged || scheduleChanged) {
    // Create new version
    const newVersionNumber = swarm.current_version + 1;
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO observation_versions (id, observation_id, version, schedule_type, cron_expression, is_paused, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        versionId,
        id,
        newVersionNumber,
        updates.schedule_type ?? swarm.schedule_type,
        updates.cron_expression ?? swarm.cron_expression,
        updates.is_paused !== undefined ? (updates.is_paused ? 1 : 0) : swarm.is_paused,
        now
      )
      .run();

    // Add models to new version
    const modelsToAdd = updates.model_ids ?? currentModels;
    for (const modelId of modelsToAdd) {
      await db
        .prepare(
          'INSERT INTO observation_version_models (observation_version_id, model_id) VALUES (?, ?)'
        )
        .bind(versionId, modelId)
        .run();
    }

    newVersion = true;
  }

  const updated = await getSwarm(db, id);
  return { swarm: updated, new_version: newVersion };
}

/**
 * Soft delete a swarm (set disabled=1)
 */
export async function deleteSwarm(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE observations SET disabled = 1 WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

/**
 * Restore a soft-deleted swarm (set disabled=0)
 */
export async function restoreSwarm(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE observations SET disabled = 0 WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

/**
 * Truncate a timestamp to minute precision for deduplication.
 * Returns format like "2026-01-22T06:00" (no seconds/milliseconds).
 */
function truncateToMinute(date: Date): string {
  return date.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

/**
 * Claim a scheduled swarm run using INSERT with UNIQUE constraint.
 * This is more robust than compare-and-swap because UNIQUE constraints
 * are enforced atomically by SQLite, even with D1's eventual consistency.
 *
 * @param db - D1 database instance
 * @param swarmId - Swarm ID
 * @param scheduledTime - The scheduled execution time (will be truncated to minute)
 * @returns true if this worker claimed the run, false if another worker already did
 */
export async function claimScheduledRun(
  db: D1Database,
  swarmId: string,
  scheduledTime: Date
): Promise<boolean> {
  const scheduledFor = truncateToMinute(scheduledTime);
  const claimId = crypto.randomUUID();
  const claimedAt = new Date().toISOString();

  try {
    await db
      .prepare(
        'INSERT INTO scheduled_run_claims (id, swarm_id, scheduled_for, claimed_at) VALUES (?, ?, ?, ?)'
      )
      .bind(claimId, swarmId, scheduledFor, claimedAt)
      .run();
    return true;
  } catch (error) {
    // UNIQUE constraint violation means another worker already claimed this run
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return false;
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Clean up old scheduled run claims to prevent unbounded table growth.
 * Call this periodically (e.g., once per day).
 *
 * @param db - D1 database instance
 * @param olderThan - Delete claims older than this date (default: 7 days ago)
 */
export async function cleanupOldScheduledRunClaims(
  db: D1Database,
  olderThan?: Date
): Promise<number> {
  const cutoff = olderThan ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cutoffStr = truncateToMinute(cutoff);
  const result = await db
    .prepare('DELETE FROM scheduled_run_claims WHERE scheduled_for < ?')
    .bind(cutoffStr)
    .run();
  return result.meta.changes;
}

/**
 * Atomically claim a swarm for execution using compare-and-swap pattern.
 * Only succeeds if last_run_at is null or strictly before the target timestamp.
 *
 * @param db - D1 database instance
 * @param id - Swarm ID
 * @param timestamp - The scheduled execution time
 * @returns true if this worker claimed the swarm, false if another worker already did
 * @deprecated Use claimScheduledRun for robust deduplication with UNIQUE constraint
 */
export async function claimSwarmExecution(
  db: D1Database,
  id: string,
  timestamp: Date
): Promise<boolean> {
  const ts = timestamp.toISOString();
  // Atomic compare-and-swap: only update if last_run_at is null or strictly less than target time
  // This ensures only ONE worker succeeds when multiple workers try to claim the same minute
  const result = await db
    .prepare(
      'UPDATE observations SET last_run_at = ? WHERE id = ? AND (last_run_at IS NULL OR last_run_at < ?)'
    )
    .bind(ts, id, ts)
    .run();
  return result.meta.changes > 0;
}

/**
 * Update last_run_at timestamp for a swarm (unconditional update)
 * @param db - D1 database instance
 * @param id - Swarm ID
 * @param timestamp - Optional timestamp to use (defaults to current time)
 * @deprecated Use claimSwarmExecution for atomic race-safe updates during cron execution
 */
export async function updateSwarmLastRunAt(
  db: D1Database,
  id: string,
  timestamp?: Date
): Promise<void> {
  const ts = (timestamp ?? new Date()).toISOString();
  await db.prepare('UPDATE observations SET last_run_at = ? WHERE id = ?').bind(ts, id).run();
}

/**
 * Get all swarm IDs that should be hidden from history
 */
export async function getHiddenSwarmIds(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare('SELECT id FROM observations WHERE hide_from_history = 1')
    .all<{ id: string }>();
  return result.results.map((r) => r.id);
}

// ==================== Swarm Runs ====================

export interface SwarmRun {
  id: string;
  swarm_id: string;
  swarm_version: number;
  run_at: string;
}

export interface SwarmRunResult {
  id: string;
  run_id: string;
  model_id: string;
  response: string | null;
  error: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  success: number;
}

export interface SwarmRunWithResults extends SwarmRun {
  results: Array<SwarmRunResult & { model_name?: string; display_name?: string; company?: string }>;
}

/**
 * Create a new swarm run and its results
 */
export async function createSwarmRun(
  db: D1Database,
  swarmId: string,
  swarmVersion: number,
  results: Array<{
    modelId: string;
    response?: string;
    error?: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    success: boolean;
  }>
): Promise<SwarmRun> {
  const runId = crypto.randomUUID();
  const runAt = new Date().toISOString();

  // Create the run record (DB table still named 'observation_runs')
  await db
    .prepare(
      'INSERT INTO observation_runs (id, observation_id, observation_version, run_at) VALUES (?, ?, ?, ?)'
    )
    .bind(runId, swarmId, swarmVersion, runAt)
    .run();

  // Create result records
  for (const result of results) {
    const resultId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO observation_run_results
         (id, run_id, model_id, response, error, latency_ms, input_tokens, output_tokens, success)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        resultId,
        runId,
        result.modelId,
        result.response ?? null,
        result.error ?? null,
        result.latencyMs,
        result.inputTokens ?? 0,
        result.outputTokens ?? 0,
        result.success ? 1 : 0
      )
      .run();
  }

  return {
    id: runId,
    swarm_id: swarmId,
    swarm_version: swarmVersion,
    run_at: runAt,
  };
}

/**
 * Get all runs for a swarm with their results
 */
export async function getSwarmRuns(
  db: D1Database,
  swarmId: string,
  limit = 50
): Promise<SwarmRunWithResults[]> {
  // Get runs
  const runs = await db
    .prepare(
      `SELECT id, observation_id as swarm_id, observation_version as swarm_version, run_at FROM observation_runs
       WHERE observation_id = ?
       ORDER BY run_at DESC
       LIMIT ?`
    )
    .bind(swarmId, limit)
    .all<SwarmRun>();

  if (!runs.results.length) {
    return [];
  }

  // Get results for each run with model info
  const runsWithResults: SwarmRunWithResults[] = [];
  for (const run of runs.results) {
    const results = await db
      .prepare(
        `SELECT r.*, m.model_name, m.display_name, m.provider as company
         FROM observation_run_results r
         LEFT JOIN models m ON r.model_id = m.id
         WHERE r.run_id = ?
         ORDER BY m.provider, m.display_name`
      )
      .bind(run.id)
      .all<SwarmRunResult & { model_name?: string; display_name?: string; company?: string }>();

    runsWithResults.push({
      ...run,
      results: results.results,
    });
  }

  return runsWithResults;
}
