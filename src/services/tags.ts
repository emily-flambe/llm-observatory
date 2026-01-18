export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export async function createTag(
  db: D1Database,
  input: { name: string; color?: string }
): Promise<Tag> {
  const id = crypto.randomUUID();
  const color = input.color ?? null;

  await db
    .prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)')
    .bind(id, input.name, color)
    .run();

  return {
    id,
    name: input.name,
    color,
    created_at: new Date().toISOString(),
  };
}

export async function getTags(db: D1Database): Promise<Tag[]> {
  const { results } = await db
    .prepare('SELECT id, name, color, created_at FROM tags ORDER BY name ASC')
    .all<Tag>();

  return results;
}

export async function getTag(db: D1Database, id: string): Promise<Tag | null> {
  return await db
    .prepare('SELECT id, name, color, created_at FROM tags WHERE id = ?')
    .bind(id)
    .first<Tag>();
}

export async function deleteTag(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM tags WHERE id = ?')
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}
