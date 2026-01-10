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
  created_at: string;
  updated_at: string;
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
    .prepare('SELECT * FROM prompt_templates WHERE active = 1 ORDER BY name')
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
