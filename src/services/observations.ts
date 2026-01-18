// D1 storage for observations (unified prompt management)
// Observations replace collections as the primary way to save and schedule prompts

export interface Observation {
  id: string;
  prompt_text: string;
  display_name: string | null;
  disabled: number;
  created_at: string;
  last_run_at: string | null;
}

export interface ObservationVersion {
  id: string;
  observation_id: string;
  version: number;
  schedule_type: string | null;
  cron_expression: string | null;
  is_paused: number;
  created_at: string;
}

export interface ObservationWithDetails extends Observation {
  current_version: number;
  schedule_type: string | null;
  cron_expression: string | null;
  is_paused: number;
  model_count: number;
  tags?: Array<{ id: string; name: string; color: string | null }>;
}

export interface ObservationTag {
  id: string;
  name: string;
  color: string | null;
}

export interface CreateObservationInput {
  prompt_text: string;
  display_name?: string;
  model_ids: string[];
  tag_ids?: string[];
  schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression?: string | null;
}

export interface UpdateObservationInput {
  display_name?: string;
  model_ids?: string[];
  tag_ids?: string[];
  schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression?: string | null;
  is_paused?: boolean;
}

/**
 * Create a new observation with initial version and model associations
 */
export async function createObservation(
  db: D1Database,
  input: CreateObservationInput
): Promise<{ observation: Observation; version: ObservationVersion }> {
  const observationId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create observation
  await db
    .prepare(
      'INSERT INTO observations (id, prompt_text, display_name, created_at) VALUES (?, ?, ?, ?)'
    )
    .bind(observationId, input.prompt_text, input.display_name ?? null, now)
    .run();

  // Create initial version (version 1, with optional schedule)
  await db
    .prepare(
      'INSERT INTO observation_versions (id, observation_id, version, schedule_type, cron_expression, is_paused, created_at) VALUES (?, ?, 1, ?, ?, 0, ?)'
    )
    .bind(
      versionId,
      observationId,
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

  // Add tags to observation
  if (input.tag_ids && input.tag_ids.length > 0) {
    for (const tagId of input.tag_ids) {
      await db
        .prepare('INSERT INTO observation_tags (observation_id, tag_id) VALUES (?, ?)')
        .bind(observationId, tagId)
        .run();
    }
  }

  const createdObservation: Observation = {
    id: observationId,
    prompt_text: input.prompt_text,
    display_name: input.display_name ?? null,
    disabled: 0,
    created_at: now,
    last_run_at: null,
  };

  const createdVersion: ObservationVersion = {
    id: versionId,
    observation_id: observationId,
    version: 1,
    schedule_type: input.schedule_type ?? null,
    cron_expression: input.cron_expression ?? null,
    is_paused: 0,
    created_at: now,
  };

  return { observation: createdObservation, version: createdVersion };
}

/**
 * Get a single observation with current version details and model count
 */
export async function getObservation(
  db: D1Database,
  id: string
): Promise<ObservationWithDetails | null> {
  const result = await db
    .prepare(
      `
      SELECT
        o.id, o.prompt_text, o.display_name, o.disabled, o.created_at, o.last_run_at,
        ov.version as current_version, ov.schedule_type, ov.cron_expression, ov.is_paused,
        (SELECT COUNT(*) FROM observation_version_models ovm WHERE ovm.observation_version_id = ov.id) as model_count
      FROM observations o
      LEFT JOIN observation_versions ov ON ov.observation_id = o.id
        AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = o.id)
      WHERE o.id = ?
    `
    )
    .bind(id)
    .first<ObservationWithDetails>();
  return result ?? null;
}

/**
 * Get all observations with current version details
 */
export async function getObservations(
  db: D1Database,
  options: { includeDisabled?: boolean } = {}
): Promise<ObservationWithDetails[]> {
  const { includeDisabled = false } = options;
  const whereClause = includeDisabled ? '' : 'WHERE o.disabled = 0';
  const result = await db
    .prepare(
      `
      SELECT
        o.id, o.prompt_text, o.display_name, o.disabled, o.created_at, o.last_run_at,
        ov.version as current_version, ov.schedule_type, ov.cron_expression, ov.is_paused,
        (SELECT COUNT(*) FROM observation_version_models ovm WHERE ovm.observation_version_id = ov.id) as model_count
      FROM observations o
      LEFT JOIN observation_versions ov ON ov.observation_id = o.id
        AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = o.id)
      ${whereClause}
      ORDER BY o.created_at DESC
    `
    )
    .all<ObservationWithDetails>();
  return result.results;
}

/**
 * Get model IDs for the current version of an observation
 */
export async function getObservationVersionModels(
  db: D1Database,
  observationId: string
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
    .bind(observationId, observationId)
    .all<{ model_id: string }>();
  return result.results.map((r) => r.model_id);
}

/**
 * Get tags for an observation
 */
export async function getObservationTags(
  db: D1Database,
  observationId: string
): Promise<ObservationTag[]> {
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
    .bind(observationId)
    .all<ObservationTag>();
  return result.results;
}

/**
 * Get all versions for an observation
 */
export async function getObservationVersions(
  db: D1Database,
  observationId: string
): Promise<ObservationVersion[]> {
  const result = await db
    .prepare('SELECT * FROM observation_versions WHERE observation_id = ? ORDER BY version DESC')
    .bind(observationId)
    .all<ObservationVersion>();
  return result.results;
}

/**
 * Update an observation. Creates a new version if models or schedule change.
 */
export async function updateObservation(
  db: D1Database,
  id: string,
  updates: UpdateObservationInput
): Promise<{ observation: ObservationWithDetails | null; new_version: boolean }> {
  const observation = await getObservation(db, id);
  if (!observation) {
    return { observation: null, new_version: false };
  }

  // Update display_name on observation if provided
  if (updates.display_name !== undefined) {
    await db
      .prepare('UPDATE observations SET display_name = ? WHERE id = ?')
      .bind(updates.display_name, id)
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
  const currentModels = await getObservationVersionModels(db, id);
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
    const newVersionNumber = observation.current_version + 1;
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
        updates.schedule_type ?? observation.schedule_type,
        updates.cron_expression ?? observation.cron_expression,
        updates.is_paused !== undefined ? (updates.is_paused ? 1 : 0) : observation.is_paused,
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

  const updated = await getObservation(db, id);
  return { observation: updated, new_version: newVersion };
}

/**
 * Soft delete an observation (set disabled=1)
 */
export async function deleteObservation(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE observations SET disabled = 1 WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

/**
 * Restore a soft-deleted observation (set disabled=0)
 */
export async function restoreObservation(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE observations SET disabled = 0 WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

/**
 * Update last_run_at timestamp after running an observation
 */
export async function updateObservationLastRunAt(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare('UPDATE observations SET last_run_at = ? WHERE id = ?').bind(now, id).run();
}

// ==================== Observation Runs ====================

export interface ObservationRun {
  id: string;
  observation_id: string;
  observation_version: number;
  run_at: string;
}

export interface ObservationRunResult {
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

export interface ObservationRunWithResults extends ObservationRun {
  results: Array<ObservationRunResult & { model_name?: string; display_name?: string; company?: string }>;
}

/**
 * Create a new observation run and its results
 */
export async function createObservationRun(
  db: D1Database,
  observationId: string,
  observationVersion: number,
  results: Array<{
    modelId: string;
    response?: string;
    error?: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    success: boolean;
  }>
): Promise<ObservationRun> {
  const runId = crypto.randomUUID();
  const runAt = new Date().toISOString();

  // Create the run record
  await db
    .prepare(
      'INSERT INTO observation_runs (id, observation_id, observation_version, run_at) VALUES (?, ?, ?, ?)'
    )
    .bind(runId, observationId, observationVersion, runAt)
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
    observation_id: observationId,
    observation_version: observationVersion,
    run_at: runAt,
  };
}

/**
 * Get all runs for an observation with their results
 */
export async function getObservationRuns(
  db: D1Database,
  observationId: string,
  limit = 50
): Promise<ObservationRunWithResults[]> {
  // Get runs
  const runs = await db
    .prepare(
      `SELECT * FROM observation_runs
       WHERE observation_id = ?
       ORDER BY run_at DESC
       LIMIT ?`
    )
    .bind(observationId, limit)
    .all<ObservationRun>();

  if (!runs.results.length) {
    return [];
  }

  // Get results for each run with model info
  const runsWithResults: ObservationRunWithResults[] = [];
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
      .all<ObservationRunResult & { model_name?: string; display_name?: string; company?: string }>();

    runsWithResults.push({
      ...run,
      results: results.results,
    });
  }

  return runsWithResults;
}
