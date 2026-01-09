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

export interface Response {
  id: string;
  topic_id: string;
  model_id: string;
  prompt: string;
  raw_response: string;
  collected_at: string;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
}

export interface ResponseWithModel extends Response {
  model_name: string;
  provider: string;
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

export async function getResponsesForTopic(
  db: D1Database,
  topicId: string,
  limit = 50
): Promise<ResponseWithModel[]> {
  const result = await db
    .prepare(
      `SELECT r.*, m.display_name as model_name, m.provider
       FROM responses r
       JOIN models m ON r.model_id = m.id
       WHERE r.topic_id = ?
       ORDER BY r.collected_at DESC
       LIMIT ?`
    )
    .bind(topicId, limit)
    .all<ResponseWithModel>();
  return result.results;
}

export async function saveResponse(db: D1Database, response: Response): Promise<void> {
  await db
    .prepare(
      `INSERT INTO responses (id, topic_id, model_id, prompt, raw_response, collected_at, latency_ms, input_tokens, output_tokens, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      response.id,
      response.topic_id,
      response.model_id,
      response.prompt,
      response.raw_response,
      response.collected_at,
      response.latency_ms,
      response.input_tokens,
      response.output_tokens,
      response.error
    )
    .run();
}
