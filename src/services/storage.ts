// D1 storage for app config (topics, models, prompt_templates)
// Responses are stored in BigQuery - see bigquery.ts

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  active: number;
  model_type: string;
  source: 'auto' | 'manual';
  last_synced: string | null;
  released_at: string | null;
  knowledge_cutoff: string | null;
  input_price_per_m: number | null; // USD per million input tokens
  output_price_per_m: number | null; // USD per million output tokens
  created_at: string;
  updated_at: string;
}

export interface ModelSyncLog {
  id: string;
  provider: string;
  synced_at: string;
  models_found: number;
  models_added: number;
  error: string | null;
}

export interface Collection {
  id: string;
  topic_id: string;
  template_id: string;
  prompt_text: string;
  display_name: string | null;
  disabled: number;
  created_at: string;
  last_run_at: string | null;
}

export interface CollectionVersion {
  id: string;
  collection_id: string;
  version: number;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression: string | null;
  is_paused: number;
  created_at: string;
}

export interface CollectionWithDetails extends Collection {
  topic_name: string;
  template_name: string;
  current_version: number;
  model_count: number;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression: string | null;
  is_paused: number;
}

// Topics

export async function getTopics(db: D1Database): Promise<Topic[]> {
  const result = await db
    .prepare('SELECT * FROM topics WHERE active = 1 ORDER BY name')
    .all<Topic>();
  return result.results;
}

export async function getTopic(db: D1Database, id: string): Promise<Topic | null> {
  const result = await db
    .prepare('SELECT * FROM topics WHERE id = ?')
    .bind(id)
    .first<Topic>();
  return result ?? null;
}

export async function createTopic(
  db: D1Database,
  topic: { id: string; name: string; description?: string }
): Promise<Topic> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO topics (id, name, description, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
    )
    .bind(topic.id, topic.name, topic.description ?? null, now, now)
    .run();
  return {
    id: topic.id,
    name: topic.name,
    description: topic.description ?? null,
    active: 1,
    created_at: now,
    updated_at: now,
  };
}

// Prompt Templates

export async function getPromptTemplates(db: D1Database): Promise<PromptTemplate[]> {
  const result = await db
    .prepare('SELECT * FROM prompt_templates WHERE active = 1 ORDER BY created_at ASC')
    .all<PromptTemplate>();
  return result.results;
}

export async function getPromptTemplate(
  db: D1Database,
  id: string
): Promise<PromptTemplate | null> {
  const result = await db
    .prepare('SELECT * FROM prompt_templates WHERE id = ?')
    .bind(id)
    .first<PromptTemplate>();
  return result ?? null;
}

export async function createPromptTemplate(
  db: D1Database,
  template: { id: string; name: string; template: string; description?: string }
): Promise<PromptTemplate> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO prompt_templates (id, name, template, description, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    )
    .bind(template.id, template.name, template.template, template.description ?? null, now, now)
    .run();
  return {
    id: template.id,
    name: template.name,
    template: template.template,
    description: template.description ?? null,
    active: 1,
    created_at: now,
    updated_at: now,
  };
}

// Models

export async function getModels(db: D1Database): Promise<Model[]> {
  const result = await db
    .prepare('SELECT * FROM models WHERE active = 1 ORDER BY provider, display_name')
    .all<Model>();
  return result.results;
}

export async function getModel(db: D1Database, id: string): Promise<Model | null> {
  const result = await db
    .prepare('SELECT * FROM models WHERE id = ?')
    .bind(id)
    .first<Model>();
  return result ?? null;
}

export async function getModelByProviderAndName(
  db: D1Database,
  provider: string,
  modelName: string
): Promise<Model | null> {
  const result = await db
    .prepare('SELECT * FROM models WHERE provider = ? AND model_name = ?')
    .bind(provider, modelName)
    .first<Model>();
  return result ?? null;
}

export async function upsertAutoModel(
  db: D1Database,
  model: {
    id: string;
    provider: string;
    model_name: string;
    display_name: string;
    model_type?: string;
    released_at?: string | null;
  }
): Promise<{ action: 'inserted' | 'updated' | 'skipped' }> {
  const existing = await getModel(db, model.id);
  const now = new Date().toISOString();

  if (existing) {
    // Never overwrite manual models
    if (existing.source === 'manual') {
      return { action: 'skipped' };
    }
    // Update auto model's last_synced (and released_at if provided and not already set)
    if (model.released_at && !existing.released_at) {
      await db
        .prepare('UPDATE models SET last_synced = ?, released_at = ?, updated_at = ? WHERE id = ?')
        .bind(now, model.released_at, now, model.id)
        .run();
    } else {
      await db
        .prepare('UPDATE models SET last_synced = ?, updated_at = ? WHERE id = ?')
        .bind(now, now, model.id)
        .run();
    }
    return { action: 'updated' };
  }

  // Insert new auto model
  await db
    .prepare(
      `INSERT INTO models (id, provider, model_name, display_name, active, model_type, source, last_synced, released_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, 'auto', ?, ?, ?, ?)`
    )
    .bind(
      model.id,
      model.provider,
      model.model_name,
      model.display_name,
      model.model_type ?? 'chat',
      now,
      model.released_at ?? null,
      now,
      now
    )
    .run();
  return { action: 'inserted' };
}

// Update model metadata from external source (basellm)
export async function updateModelMetadata(
  db: D1Database,
  modelName: string,
  metadata: {
    released_at?: string | null;
    knowledge_cutoff?: string | null;
  }
): Promise<{ updated: boolean }> {
  const now = new Date().toISOString();

  // Find model by model_name (could match multiple providers)
  const result = await db
    .prepare('SELECT id FROM models WHERE model_name = ?')
    .bind(modelName)
    .all<{ id: string }>();

  if (result.results.length === 0) {
    return { updated: false };
  }

  // Update all matching models
  for (const model of result.results) {
    await db
      .prepare(
        `UPDATE models SET
         released_at = COALESCE(?, released_at),
         knowledge_cutoff = COALESCE(?, knowledge_cutoff),
         updated_at = ?
         WHERE id = ?`
      )
      .bind(metadata.released_at ?? null, metadata.knowledge_cutoff ?? null, now, model.id)
      .run();
  }

  return { updated: true };
}

export async function logModelSync(
  db: D1Database,
  log: {
    id: string;
    provider: string;
    models_found: number;
    models_added: number;
    error?: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO model_sync_log (id, provider, synced_at, models_found, models_added, error)
       VALUES (?, ?, datetime('now'), ?, ?, ?)`
    )
    .bind(log.id, log.provider, log.models_found, log.models_added, log.error ?? null)
    .run();
}

export async function getModelSyncLogs(
  db: D1Database,
  limit: number = 20
): Promise<ModelSyncLog[]> {
  const result = await db
    .prepare('SELECT * FROM model_sync_log ORDER BY synced_at DESC LIMIT ?')
    .bind(limit)
    .all<ModelSyncLog>();
  return result.results;
}

// Collections

export async function getCollections(
  db: D1Database,
  options: { includeDisabled?: boolean } = {}
): Promise<CollectionWithDetails[]> {
  const { includeDisabled = true } = options;
  const whereClause = includeDisabled ? '' : 'WHERE c.disabled = 0';
  const result = await db
    .prepare(`
      SELECT
        c.id,
        c.topic_id,
        c.template_id,
        c.prompt_text,
        c.display_name,
        c.disabled,
        c.created_at,
        c.last_run_at,
        t.name as topic_name,
        pt.name as template_name,
        cv.version as current_version,
        cv.schedule_type,
        cv.cron_expression,
        cv.is_paused,
        (SELECT COUNT(*) FROM collection_version_models cvm WHERE cvm.collection_version_id = cv.id) as model_count
      FROM collections c
      LEFT JOIN topics t ON c.topic_id = t.id
      LEFT JOIN prompt_templates pt ON c.template_id = pt.id
      LEFT JOIN collection_versions cv ON cv.collection_id = c.id
        AND cv.version = (SELECT MAX(version) FROM collection_versions WHERE collection_id = c.id)
      ${whereClause}
      ORDER BY c.created_at DESC
    `)
    .all<CollectionWithDetails>();
  return result.results;
}

export async function getCollection(
  db: D1Database,
  id: string
): Promise<CollectionWithDetails | null> {
  const result = await db
    .prepare(`
      SELECT
        c.id,
        c.topic_id,
        c.template_id,
        c.prompt_text,
        c.display_name,
        c.disabled,
        c.created_at,
        c.last_run_at,
        t.name as topic_name,
        pt.name as template_name,
        cv.version as current_version,
        cv.schedule_type,
        cv.cron_expression,
        cv.is_paused,
        (SELECT COUNT(*) FROM collection_version_models cvm WHERE cvm.collection_version_id = cv.id) as model_count
      FROM collections c
      LEFT JOIN topics t ON c.topic_id = t.id
      LEFT JOIN prompt_templates pt ON c.template_id = pt.id
      LEFT JOIN collection_versions cv ON cv.collection_id = c.id
        AND cv.version = (SELECT MAX(version) FROM collection_versions WHERE collection_id = c.id)
      WHERE c.id = ?
    `)
    .bind(id)
    .first<CollectionWithDetails>();
  return result ?? null;
}

export async function getCollectionByTopicAndTemplate(
  db: D1Database,
  topicId: string,
  templateId: string
): Promise<Collection | null> {
  const result = await db
    .prepare('SELECT * FROM collections WHERE topic_id = ? AND template_id = ?')
    .bind(topicId, templateId)
    .first<Collection>();
  return result ?? null;
}

export async function createCollection(
  db: D1Database,
  collection: {
    topic_id: string;
    template_id: string;
    prompt_text: string;
    display_name?: string;
    model_ids: string[];
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
  }
): Promise<{ collection: Collection; version: CollectionVersion }> {
  const collectionId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create collection
  await db
    .prepare(
      'INSERT INTO collections (id, topic_id, template_id, prompt_text, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(
      collectionId,
      collection.topic_id,
      collection.template_id,
      collection.prompt_text,
      collection.display_name ?? null,
      now
    )
    .run();

  // Create initial version (version 1, with optional schedule)
  await db
    .prepare(
      'INSERT INTO collection_versions (id, collection_id, version, schedule_type, cron_expression, is_paused, created_at) VALUES (?, ?, 1, ?, ?, 0, ?)'
    )
    .bind(versionId, collectionId, collection.schedule_type ?? null, collection.cron_expression ?? null, now)
    .run();

  // Add models to version
  for (const modelId of collection.model_ids) {
    await db
      .prepare(
        'INSERT INTO collection_version_models (collection_version_id, model_id) VALUES (?, ?)'
      )
      .bind(versionId, modelId)
      .run();
  }

  const createdCollection: Collection = {
    id: collectionId,
    topic_id: collection.topic_id,
    template_id: collection.template_id,
    prompt_text: collection.prompt_text,
    display_name: collection.display_name ?? null,
    disabled: 0,
    created_at: now,
    last_run_at: null,
  };

  const createdVersion: CollectionVersion = {
    id: versionId,
    collection_id: collectionId,
    version: 1,
    schedule_type: collection.schedule_type ?? null,
    cron_expression: collection.cron_expression ?? null,
    is_paused: 0,
    created_at: now,
  };

  return { collection: createdCollection, version: createdVersion };
}

export async function getCollectionVersionModels(
  db: D1Database,
  collectionId: string
): Promise<string[]> {
  // Get the current version's models
  const result = await db
    .prepare(`
      SELECT cvm.model_id
      FROM collection_version_models cvm
      JOIN collection_versions cv ON cv.id = cvm.collection_version_id
      WHERE cv.collection_id = ?
        AND cv.version = (SELECT MAX(version) FROM collection_versions WHERE collection_id = ?)
    `)
    .bind(collectionId, collectionId)
    .all<{ model_id: string }>();
  return result.results.map((r) => r.model_id);
}

export async function getCollectionVersions(
  db: D1Database,
  collectionId: string
): Promise<CollectionVersion[]> {
  const result = await db
    .prepare('SELECT * FROM collection_versions WHERE collection_id = ? ORDER BY version DESC')
    .bind(collectionId)
    .all<CollectionVersion>();
  return result.results;
}

export async function updateCollection(
  db: D1Database,
  id: string,
  updates: {
    display_name?: string;
    model_ids?: string[];
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
    is_paused?: boolean;
  }
): Promise<{ collection: CollectionWithDetails | null; new_version: boolean }> {
  const collection = await getCollection(db, id);
  if (!collection) {
    return { collection: null, new_version: false };
  }

  // Update display_name on collection if provided
  if (updates.display_name !== undefined) {
    await db
      .prepare('UPDATE collections SET display_name = ? WHERE id = ?')
      .bind(updates.display_name, id)
      .run();
  }

  // Check if we need a new version (models or schedule changed)
  const currentModels = await getCollectionVersionModels(db, id);
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
    const newVersionNumber = collection.current_version + 1;
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO collection_versions (id, collection_id, version, schedule_type, cron_expression, is_paused, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        versionId,
        id,
        newVersionNumber,
        updates.schedule_type ?? collection.schedule_type,
        updates.cron_expression ?? collection.cron_expression,
        updates.is_paused !== undefined ? (updates.is_paused ? 1 : 0) : collection.is_paused,
        now
      )
      .run();

    // Add models to new version
    const modelsToAdd = updates.model_ids ?? currentModels;
    for (const modelId of modelsToAdd) {
      await db
        .prepare(
          'INSERT INTO collection_version_models (collection_version_id, model_id) VALUES (?, ?)'
        )
        .bind(versionId, modelId)
        .run();
    }

    newVersion = true;
  }

  const updated = await getCollection(db, id);
  return { collection: updated, new_version: newVersion };
}

export async function deleteCollection(db: D1Database, id: string): Promise<boolean> {
  // Soft-delete: set disabled flag instead of actually deleting
  const result = await db.prepare('UPDATE collections SET disabled = 1 WHERE id = ?').bind(id).run();
  return result.meta.changes > 0;
}

export async function restoreCollection(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('UPDATE collections SET disabled = 0 WHERE id = ?').bind(id).run();
  return result.meta.changes > 0;
}

export async function updateCollectionLastRunAt(
  db: D1Database,
  id: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE collections SET last_run_at = ? WHERE id = ?')
    .bind(now, id)
    .run();
}
