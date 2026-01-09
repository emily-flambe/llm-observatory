// D1 storage for app config (topics, models)
// Responses are stored in BigQuery - see bigquery.ts

export interface Topic {
  id: string;
  name: string;
  category: string;
  active: number;
  created_at: string;
}

export interface Model {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  active: number;
}

export async function getTopics(db: D1Database): Promise<Topic[]> {
  const result = await db
    .prepare('SELECT * FROM topics WHERE active = 1 ORDER BY category, name')
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
