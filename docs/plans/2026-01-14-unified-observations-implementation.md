# Unified Observations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify Prompt Lab and Collect into a single "Collect" UI where all prompts are "observations" with optional scheduling.

**Architecture:** New D1 tables (tags, observations, observation_versions, observation_version_models, observation_tags). New backend services and routes. Complete frontend rewrite of Collect pages. Deprecate but retain old tables/routes for BigQuery backward compatibility.

**Tech Stack:** Cloudflare Workers (Hono), D1 SQLite, BigQuery, React, TypeScript, Vitest

---

## Phase 1: Database Migrations

### Task 1.1: Create tags table migration

**Files:**
- Create: `migrations/0002_create_tags.sql`

**Step 1: Write the migration file**

```sql
-- Tags for categorizing observations
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Step 2: Apply migration locally**

Run: `npx wrangler d1 execute llm-observatory-db --local --file=./migrations/0002_create_tags.sql`
Expected: Success message with "1 commands executed successfully"

**Step 3: Verify table exists**

Run: `npx wrangler d1 execute llm-observatory-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='tags'"`
Expected: Output showing `tags` table

**Step 4: Commit**

```bash
git add migrations/0002_create_tags.sql
git commit -m "Add tags table migration"
```

---

### Task 1.2: Create observations table migration

**Files:**
- Create: `migrations/0003_create_observations.sql`

**Step 1: Write the migration file**

```sql
-- Observations: saved prompts that can run on schedule
CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    prompt_text TEXT NOT NULL,
    display_name TEXT,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_run_at TEXT
);
```

**Step 2: Apply migration locally**

Run: `npx wrangler d1 execute llm-observatory-db --local --file=./migrations/0003_create_observations.sql`
Expected: Success

**Step 3: Commit**

```bash
git add migrations/0003_create_observations.sql
git commit -m "Add observations table migration"
```

---

### Task 1.3: Create observation_tags junction table migration

**Files:**
- Create: `migrations/0004_create_observation_tags.sql`

**Step 1: Write the migration file**

```sql
-- Many-to-many relationship between observations and tags
CREATE TABLE IF NOT EXISTS observation_tags (
    observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (observation_id, tag_id)
);
```

**Step 2: Apply migration locally**

Run: `npx wrangler d1 execute llm-observatory-db --local --file=./migrations/0004_create_observation_tags.sql`
Expected: Success

**Step 3: Commit**

```bash
git add migrations/0004_create_observation_tags.sql
git commit -m "Add observation_tags junction table migration"
```

---

### Task 1.4: Create observation_versions table migration

**Files:**
- Create: `migrations/0005_create_observation_versions.sql`

**Step 1: Write the migration file**

```sql
-- Versioned configuration for observations (models + schedule)
CREATE TABLE IF NOT EXISTS observation_versions (
    id TEXT PRIMARY KEY,
    observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    schedule_type TEXT,
    cron_expression TEXT,
    is_paused INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(observation_id, version)
);
```

**Step 2: Apply migration locally**

Run: `npx wrangler d1 execute llm-observatory-db --local --file=./migrations/0005_create_observation_versions.sql`
Expected: Success

**Step 3: Commit**

```bash
git add migrations/0005_create_observation_versions.sql
git commit -m "Add observation_versions table migration"
```

---

### Task 1.5: Create observation_version_models junction table migration

**Files:**
- Create: `migrations/0006_create_observation_version_models.sql`

**Step 1: Write the migration file**

```sql
-- Models assigned to each observation version
CREATE TABLE IF NOT EXISTS observation_version_models (
    observation_version_id TEXT NOT NULL REFERENCES observation_versions(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL REFERENCES models(id),
    PRIMARY KEY (observation_version_id, model_id)
);
```

**Step 2: Apply migration locally**

Run: `npx wrangler d1 execute llm-observatory-db --local --file=./migrations/0006_create_observation_version_models.sql`
Expected: Success

**Step 3: Commit**

```bash
git add migrations/0006_create_observation_version_models.sql
git commit -m "Add observation_version_models junction table migration"
```

---

## Phase 2: Backend Services - Tags

### Task 2.1: Write failing test for createTag

**Files:**
- Create: `tests/services/tags.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTag, getTags, deleteTag } from '../../src/services/tags';

function createMockDb() {
  const mockResults: Record<string, unknown> = {};
  const mockFirst: Record<string, unknown> = {};

  const mockStatement = {
    bind: vi.fn((...args: unknown[]) => mockStatement),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn(async <T>(): Promise<T | null> => mockFirst.value as T ?? null),
    all: vi.fn(async <T>(): Promise<{ results: T[] }> => ({ results: (mockResults.value as T[]) ?? [] })),
  };

  const db = {
    prepare: vi.fn(() => mockStatement),
    _mockStatement: mockStatement,
    _setResults: (value: unknown[]) => { mockResults.value = value; },
    _setFirst: (value: unknown) => { mockFirst.value = value; },
  };

  return db as unknown as D1Database & typeof db;
}

describe('Tag Storage Functions', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe('createTag', () => {
    it('creates a tag with name only', async () => {
      const result = await createTag(mockDb, { name: 'Test Tag' });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Tag');
      expect(result.id).toBeDefined();
      expect(result.color).toBeNull();
    });

    it('creates a tag with name and color', async () => {
      const result = await createTag(mockDb, { name: 'Colored Tag', color: '#FF5733' });

      expect(result.name).toBe('Colored Tag');
      expect(result.color).toBe('#FF5733');
    });
  });

  describe('getTags', () => {
    it('returns empty array when no tags exist', async () => {
      mockDb._setResults([]);

      const result = await getTags(mockDb);

      expect(result).toEqual([]);
    });

    it('returns all tags ordered by name', async () => {
      mockDb._setResults([
        { id: 'tag-1', name: 'Alpha', color: null, created_at: '2025-01-01' },
        { id: 'tag-2', name: 'Beta', color: '#FF0000', created_at: '2025-01-02' },
      ]);

      const result = await getTags(mockDb);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alpha');
    });
  });

  describe('deleteTag', () => {
    it('returns true when tag deleted', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await deleteTag(mockDb, 'tag-123');

      expect(result).toBe(true);
    });

    it('returns false when tag not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await deleteTag(mockDb, 'non-existent');

      expect(result).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/tags.test.ts`
Expected: FAIL - module not found

---

### Task 2.2: Implement tag storage functions

**Files:**
- Create: `src/services/tags.ts`

**Step 1: Write the implementation**

```typescript
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
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- tests/services/tags.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/services/tags.ts tests/services/tags.test.ts
git commit -m "Add tag storage service with tests"
```

---

## Phase 3: Backend Services - Observations

### Task 3.1: Write failing tests for observation CRUD

**Files:**
- Create: `tests/services/observations.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createObservation,
  getObservation,
  getObservations,
  updateObservation,
  deleteObservation,
  restoreObservation,
  getObservationVersionModels,
  updateObservationLastRunAt,
} from '../../src/services/observations';

function createMockDb() {
  const mockResults: Record<string, unknown> = {};
  const mockFirst: Record<string, unknown> = {};
  let lastBoundValues: unknown[] = [];

  const mockStatement = {
    bind: vi.fn((...args: unknown[]) => {
      lastBoundValues = args;
      return mockStatement;
    }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn(async <T>(): Promise<T | null> => mockFirst.value as T ?? null),
    all: vi.fn(async <T>(): Promise<{ results: T[] }> => ({ results: (mockResults.value as T[]) ?? [] })),
  };

  const db = {
    prepare: vi.fn(() => mockStatement),
    _mockStatement: mockStatement,
    _setResults: (value: unknown[]) => { mockResults.value = value; },
    _setFirst: (value: unknown) => { mockFirst.value = value; },
    _getLastBoundValues: () => lastBoundValues,
  };

  return db as unknown as D1Database & typeof db;
}

describe('Observation Storage Functions', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe('createObservation', () => {
    it('creates an observation with required fields', async () => {
      const input = {
        prompt_text: 'What is the meaning of life?',
        model_ids: ['model-1', 'model-2'],
      };

      const result = await createObservation(mockDb, input);

      expect(result.observation).toBeDefined();
      expect(result.observation.prompt_text).toBe('What is the meaning of life?');
      expect(result.observation.display_name).toBeNull();
      expect(result.observation.id).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.version.version).toBe(1);
      expect(result.version.schedule_type).toBeNull();
    });

    it('creates an observation with optional fields', async () => {
      const input = {
        prompt_text: 'Test prompt',
        display_name: 'My Observation',
        model_ids: ['model-1'],
        tag_ids: ['tag-1', 'tag-2'],
        schedule_type: 'daily' as const,
      };

      const result = await createObservation(mockDb, input);

      expect(result.observation.display_name).toBe('My Observation');
      expect(result.version.schedule_type).toBe('daily');
    });
  });

  describe('getObservation', () => {
    it('returns null when observation not found', async () => {
      mockDb._setFirst(null);

      const result = await getObservation(mockDb, 'non-existent-id');

      expect(result).toBeNull();
    });

    it('returns observation with details when found', async () => {
      const mockObservation = {
        id: 'obs-123',
        prompt_text: 'Test prompt',
        display_name: null,
        disabled: 0,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
        current_version: 1,
        schedule_type: null,
        cron_expression: null,
        is_paused: 0,
        model_count: 3,
      };
      mockDb._setFirst(mockObservation);

      const result = await getObservation(mockDb, 'obs-123');

      expect(result).toEqual(mockObservation);
    });
  });

  describe('getObservations', () => {
    it('returns empty array when no observations exist', async () => {
      mockDb._setResults([]);

      const result = await getObservations(mockDb);

      expect(result).toEqual([]);
    });

    it('excludes disabled observations by default', async () => {
      mockDb._setResults([
        { id: 'obs-1', disabled: 0 },
      ]);

      await getObservations(mockDb);

      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('includes disabled observations when requested', async () => {
      mockDb._setResults([
        { id: 'obs-1', disabled: 0 },
        { id: 'obs-2', disabled: 1 },
      ]);

      const result = await getObservations(mockDb, { includeDisabled: true });

      expect(result).toHaveLength(2);
    });
  });

  describe('deleteObservation', () => {
    it('soft-deletes observation by setting disabled flag', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await deleteObservation(mockDb, 'obs-123');

      expect(result).toBe(true);
    });

    it('returns false when observation not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await deleteObservation(mockDb, 'non-existent');

      expect(result).toBe(false);
    });
  });

  describe('restoreObservation', () => {
    it('restores disabled observation', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await restoreObservation(mockDb, 'obs-123');

      expect(result).toBe(true);
    });
  });

  describe('updateObservationLastRunAt', () => {
    it('updates last_run_at timestamp', async () => {
      await updateObservationLastRunAt(mockDb, 'obs-123');

      expect(mockDb.prepare).toHaveBeenCalled();
      const boundValues = mockDb._getLastBoundValues();
      expect(boundValues[1]).toBe('obs-123');
      expect(typeof boundValues[0]).toBe('string');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/observations.test.ts`
Expected: FAIL - module not found

---

### Task 3.2: Implement observation storage functions

**Files:**
- Create: `src/services/observations.ts`

**Step 1: Write the implementation**

```typescript
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

export interface CreateObservationInput {
  prompt_text: string;
  display_name?: string;
  model_ids: string[];
  tag_ids?: string[];
  schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression?: string | null;
}

export async function createObservation(
  db: D1Database,
  input: CreateObservationInput
): Promise<{ observation: Observation; version: ObservationVersion }> {
  const observationId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  // Insert observation
  await db
    .prepare(
      'INSERT INTO observations (id, prompt_text, display_name) VALUES (?, ?, ?)'
    )
    .bind(observationId, input.prompt_text, input.display_name ?? null)
    .run();

  // Insert version
  await db
    .prepare(
      'INSERT INTO observation_versions (id, observation_id, version, schedule_type, cron_expression) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(
      versionId,
      observationId,
      1,
      input.schedule_type ?? null,
      input.cron_expression ?? null
    )
    .run();

  // Insert model associations
  for (const modelId of input.model_ids) {
    await db
      .prepare(
        'INSERT INTO observation_version_models (observation_version_id, model_id) VALUES (?, ?)'
      )
      .bind(versionId, modelId)
      .run();
  }

  // Insert tag associations
  if (input.tag_ids) {
    for (const tagId of input.tag_ids) {
      await db
        .prepare(
          'INSERT INTO observation_tags (observation_id, tag_id) VALUES (?, ?)'
        )
        .bind(observationId, tagId)
        .run();
    }
  }

  const observation: Observation = {
    id: observationId,
    prompt_text: input.prompt_text,
    display_name: input.display_name ?? null,
    disabled: 0,
    created_at: new Date().toISOString(),
    last_run_at: null,
  };

  const version: ObservationVersion = {
    id: versionId,
    observation_id: observationId,
    version: 1,
    schedule_type: input.schedule_type ?? null,
    cron_expression: input.cron_expression ?? null,
    is_paused: 0,
    created_at: new Date().toISOString(),
  };

  return { observation, version };
}

export async function getObservation(
  db: D1Database,
  id: string
): Promise<ObservationWithDetails | null> {
  const observation = await db
    .prepare(
      `SELECT
        o.id, o.prompt_text, o.display_name, o.disabled, o.created_at, o.last_run_at,
        ov.version as current_version, ov.schedule_type, ov.cron_expression, ov.is_paused,
        (SELECT COUNT(*) FROM observation_version_models ovm WHERE ovm.observation_version_id = ov.id) as model_count
      FROM observations o
      LEFT JOIN observation_versions ov ON ov.observation_id = o.id
        AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = o.id)
      WHERE o.id = ?`
    )
    .bind(id)
    .first<ObservationWithDetails>();

  return observation;
}

export async function getObservations(
  db: D1Database,
  options: { includeDisabled?: boolean; tagIds?: string[]; search?: string } = {}
): Promise<ObservationWithDetails[]> {
  const { includeDisabled = false } = options;

  let query = `
    SELECT
      o.id, o.prompt_text, o.display_name, o.disabled, o.created_at, o.last_run_at,
      ov.version as current_version, ov.schedule_type, ov.cron_expression, ov.is_paused,
      (SELECT COUNT(*) FROM observation_version_models ovm WHERE ovm.observation_version_id = ov.id) as model_count
    FROM observations o
    LEFT JOIN observation_versions ov ON ov.observation_id = o.id
      AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = o.id)
    WHERE 1=1
  `;

  if (!includeDisabled) {
    query += ' AND o.disabled = 0';
  }

  query += ' ORDER BY o.created_at DESC';

  const { results } = await db.prepare(query).all<ObservationWithDetails>();

  return results;
}

export async function getObservationVersionModels(
  db: D1Database,
  observationId: string
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT ovm.model_id
      FROM observation_version_models ovm
      JOIN observation_versions ov ON ov.id = ovm.observation_version_id
      WHERE ov.observation_id = ?
        AND ov.version = (SELECT MAX(version) FROM observation_versions WHERE observation_id = ?)
      ORDER BY ovm.model_id`
    )
    .bind(observationId, observationId)
    .all<{ model_id: string }>();

  return results.map((r) => r.model_id);
}

export async function getObservationTags(
  db: D1Database,
  observationId: string
): Promise<Array<{ id: string; name: string; color: string | null }>> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.name, t.color
      FROM tags t
      JOIN observation_tags ot ON ot.tag_id = t.id
      WHERE ot.observation_id = ?
      ORDER BY t.name`
    )
    .bind(observationId)
    .all<{ id: string; name: string; color: string | null }>();

  return results;
}

export async function updateObservation(
  db: D1Database,
  id: string,
  input: {
    display_name?: string;
    tag_ids?: string[];
    model_ids?: string[];
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
    is_paused?: boolean;
  }
): Promise<{ observation: ObservationWithDetails | null; new_version: boolean }> {
  const existing = await getObservation(db, id);
  if (!existing) {
    return { observation: null, new_version: false };
  }

  // Update display_name if provided
  if (input.display_name !== undefined) {
    await db
      .prepare('UPDATE observations SET display_name = ? WHERE id = ?')
      .bind(input.display_name, id)
      .run();
  }

  // Update tags if provided (replace all)
  if (input.tag_ids !== undefined) {
    await db.prepare('DELETE FROM observation_tags WHERE observation_id = ?').bind(id).run();
    for (const tagId of input.tag_ids) {
      await db
        .prepare('INSERT INTO observation_tags (observation_id, tag_id) VALUES (?, ?)')
        .bind(id, tagId)
        .run();
    }
  }

  // Check if we need a new version (models or schedule changed)
  let newVersion = false;
  if (
    input.model_ids !== undefined ||
    input.schedule_type !== undefined ||
    input.cron_expression !== undefined ||
    input.is_paused !== undefined
  ) {
    const newVersionNum = existing.current_version + 1;
    const versionId = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO observation_versions (id, observation_id, version, schedule_type, cron_expression, is_paused)
        VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        versionId,
        id,
        newVersionNum,
        input.schedule_type ?? existing.schedule_type,
        input.cron_expression ?? existing.cron_expression,
        input.is_paused !== undefined ? (input.is_paused ? 1 : 0) : existing.is_paused
      )
      .run();

    // Copy or update model associations
    const modelIds = input.model_ids ?? (await getObservationVersionModels(db, id));
    for (const modelId of modelIds) {
      await db
        .prepare('INSERT INTO observation_version_models (observation_version_id, model_id) VALUES (?, ?)')
        .bind(versionId, modelId)
        .run();
    }

    newVersion = true;
  }

  const updated = await getObservation(db, id);
  return { observation: updated, new_version: newVersion };
}

export async function deleteObservation(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE observations SET disabled = 1 WHERE id = ?')
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function restoreObservation(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE observations SET disabled = 0 WHERE id = ?')
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function updateObservationLastRunAt(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare('UPDATE observations SET last_run_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();
}

export async function getObservationVersions(
  db: D1Database,
  observationId: string
): Promise<ObservationVersion[]> {
  const { results } = await db
    .prepare(
      `SELECT id, observation_id, version, schedule_type, cron_expression, is_paused, created_at
      FROM observation_versions
      WHERE observation_id = ?
      ORDER BY version DESC`
    )
    .bind(observationId)
    .all<ObservationVersion>();

  return results;
}
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- tests/services/observations.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/services/observations.ts tests/services/observations.test.ts
git commit -m "Add observation storage service with tests"
```

---

## Phase 4: API Routes

### Task 4.1: Add tag API routes

**Files:**
- Modify: `src/routes/api.ts`

**Step 1: Add imports at top of file**

Add after existing imports:
```typescript
import { createTag, getTags, deleteTag } from '../services/tags';
```

**Step 2: Add tag routes after topics section**

Add before `// ==================== Prompt Lab History ====================`:
```typescript
// ==================== Tags ====================

// List all tags
api.get('/tags', async (c) => {
  const tags = await getTags(c.env.DB);
  return c.json({ tags });
});

// Create a tag
api.post('/tags', async (c) => {
  const body = await c.req.json<{ name: string; color?: string }>();

  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  try {
    const tag = await createTag(c.env.DB, body);
    return c.json({ tag }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create tag';
    if (message.includes('UNIQUE constraint')) {
      return c.json({ error: 'Tag with this name already exists' }, 409);
    }
    return c.json({ error: message }, 500);
  }
});

// Delete a tag
api.delete('/tags/:id', async (c) => {
  const { id } = c.req.param();
  const deleted = await deleteTag(c.env.DB, id);
  if (!deleted) {
    return c.json({ error: 'Tag not found' }, 404);
  }
  return c.json({ success: true });
});
```

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing ones)

**Step 4: Commit**

```bash
git add src/routes/api.ts
git commit -m "Add tag API routes"
```

---

### Task 4.2: Add observation API routes

**Files:**
- Modify: `src/routes/api.ts`

**Step 1: Add imports**

Update imports to include:
```typescript
import {
  createObservation,
  getObservation,
  getObservations,
  updateObservation,
  deleteObservation,
  restoreObservation,
  getObservationVersionModels,
  getObservationTags,
  getObservationVersions,
  updateObservationLastRunAt,
} from '../services/observations';
```

**Step 2: Add observation routes after tags section**

Add before `// ==================== Prompt Templates ====================`:
```typescript
// ==================== Observations ====================

// Helper to run an observation
async function runObservationInternal(
  env: Env,
  db: D1Database,
  observationId: string
): Promise<{
  success: boolean;
  error?: string;
  results?: Array<{ modelId: string; success: boolean; latencyMs?: number; error?: string }>;
}> {
  const observation = await getObservation(db, observationId);
  if (!observation) {
    return { success: false, error: 'Observation not found' };
  }

  const modelIds = await getObservationVersionModels(db, observationId);
  if (modelIds.length === 0) {
    return { success: false, error: 'Observation has no models configured' };
  }

  const rateLimit = await checkRateLimit(db, 'collect');
  if (rateLimit.remaining < modelIds.length) {
    return {
      success: false,
      error: `Would exceed daily rate limit (requested: ${modelIds.length}, remaining: ${rateLimit.remaining})`,
    };
  }

  const promptId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();
  const tags = await getObservationTags(db, observationId);

  const modelPromises = modelIds.map(async (modelId) => {
    const model = await getModel(db, modelId);
    if (!model) {
      return { modelId, success: false, error: 'Model not found' } as const;
    }

    let responseContent: string | null = null;
    let reasoningContent: string | null = null;
    let errorMsg: string | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const provider = createLLMProvider(model.id, model.provider, model.model_name, env);
      const start = Date.now();
      const response = await provider.complete({ prompt: observation.prompt_text });
      latencyMs = Date.now() - start;
      responseContent = response.content;
      reasoningContent = response.reasoningContent ?? null;
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    }

    let inputCost: number | null = null;
    let outputCost: number | null = null;
    if (model.input_price_per_m !== null && inputTokens > 0) {
      inputCost = (inputTokens / 1_000_000) * model.input_price_per_m;
    }
    if (model.output_price_per_m !== null && outputTokens > 0) {
      outputCost = (outputTokens / 1_000_000) * model.output_price_per_m;
    }

    const bqRow: BigQueryRow = {
      id: crypto.randomUUID(),
      prompt_id: promptId,
      collected_at: collectedAt,
      source: 'observation',
      company: extractCompany(model.provider, model.model_name),
      product: extractProductFamily(model.model_name),
      model: model.model_name,
      topic_id: null,
      topic_name: null,
      prompt_template_id: null,
      prompt_template_name: null,
      prompt: observation.prompt_text,
      response: responseContent,
      reasoning_content: reasoningContent,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      error: errorMsg,
      success: !errorMsg,
      observation_id: observation.id,
      observation_version: observation.current_version,
    };
    insertRow(env, bqRow).catch((err) => {
      console.error('Failed to save observation response to BigQuery:', err);
    });

    return errorMsg
      ? ({ modelId, success: false, error: errorMsg } as const)
      : ({ modelId, success: true, latencyMs } as const);
  });

  const results = await Promise.all(modelPromises);
  await updateObservationLastRunAt(db, observationId);
  await incrementRateLimit(db, 'collect', results.length);

  return { success: true, results };
}

// List all observations
api.get('/observations', async (c) => {
  const includeDisabledParam = c.req.query('includeDisabled');
  const includeDisabled = includeDisabledParam === 'true';
  const observations = await getObservations(c.env.DB, { includeDisabled });

  // Fetch tags for each observation
  const observationsWithTags = await Promise.all(
    observations.map(async (obs) => {
      const tags = await getObservationTags(c.env.DB, obs.id);
      return { ...obs, tags };
    })
  );

  return c.json({ observations: observationsWithTags });
});

// Get single observation
api.get('/observations/:id', async (c) => {
  const { id } = c.req.param();
  const observation = await getObservation(c.env.DB, id);
  if (!observation) {
    return c.json({ error: 'Observation not found' }, 404);
  }

  const modelIds = await getObservationVersionModels(c.env.DB, id);
  const tags = await getObservationTags(c.env.DB, id);
  const versions = await getObservationVersions(c.env.DB, id);

  return c.json({
    observation: {
      ...observation,
      models: modelIds.map((id) => ({ id })),
      tags,
      versions,
    },
  });
});

// Create observation and run immediately
api.post('/observations', async (c) => {
  const body = await c.req.json<{
    prompt_text: string;
    model_ids: string[];
    display_name?: string;
    tag_ids?: string[];
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
    word_limit?: number;
  }>();

  if (!body.prompt_text || !body.model_ids?.length) {
    return c.json({ error: 'prompt_text and model_ids are required' }, 400);
  }

  // Apply word limit if specified
  let promptText = body.prompt_text;
  if (body.word_limit && body.word_limit > 0) {
    promptText = `${body.prompt_text}\n\nLimit your response to ${body.word_limit} words.`;
  }

  try {
    const { observation } = await createObservation(c.env.DB, {
      prompt_text: promptText,
      display_name: body.display_name,
      model_ids: body.model_ids,
      tag_ids: body.tag_ids,
      schedule_type: body.schedule_type,
      cron_expression: body.cron_expression,
    });

    // Run immediately
    const runResult = await runObservationInternal(c.env, c.env.DB, observation.id);

    const observationWithDetails = await getObservation(c.env.DB, observation.id);
    const tags = await getObservationTags(c.env.DB, observation.id);

    return c.json(
      {
        observation: { ...observationWithDetails, tags },
        results: runResult.results ?? [],
        created: true,
      },
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create observation';
    return c.json({ error: message }, 500);
  }
});

// Update observation
api.put('/observations/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    display_name?: string;
    tag_ids?: string[];
    model_ids?: string[];
    schedule_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
    cron_expression?: string | null;
    is_paused?: boolean;
  }>();

  const { observation, new_version } = await updateObservation(c.env.DB, id, body);
  if (!observation) {
    return c.json({ error: 'Observation not found' }, 404);
  }

  const tags = await getObservationTags(c.env.DB, id);
  return c.json({ observation: { ...observation, tags }, new_version });
});

// Delete (soft-delete) observation
api.delete('/observations/:id', async (c) => {
  const { id } = c.req.param();
  const deleted = await deleteObservation(c.env.DB, id);
  if (!deleted) {
    return c.json({ error: 'Observation not found' }, 404);
  }
  return c.json({ success: true });
});

// Restore observation
api.put('/observations/:id/restore', async (c) => {
  const { id } = c.req.param();
  const restored = await restoreObservation(c.env.DB, id);
  if (!restored) {
    return c.json({ error: 'Observation not found' }, 404);
  }
  return c.json({ success: true });
});

// Run observation manually (admin protected)
admin.post('/observations/:id/run', async (c) => {
  const { id } = c.req.param();
  const result = await runObservationInternal(c.env, c.env.DB, id);
  if (!result.success) {
    const status = result.error?.includes('not found')
      ? 404
      : result.error?.includes('rate limit')
        ? 429
        : 400;
    return c.json({ error: result.error }, status);
  }

  return c.json({
    observation_id: id,
    results: result.results,
    successful: result.results?.filter((r) => r.success).length ?? 0,
    failed: result.results?.filter((r) => !r.success).length ?? 0,
  });
});
```

**Step 3: Update BigQueryRow type**

In `src/services/bigquery.ts`, add to the BigQueryRow interface:
```typescript
observation_id?: string | null;
observation_version?: number | null;
```

**Step 4: Run lint and type-check**

Run: `npm run lint && npm run type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add src/routes/api.ts src/services/bigquery.ts
git commit -m "Add observation API routes"
```

---

## Phase 5: Frontend - New Observation Form

### Task 5.1: Create ObservationForm component

**Files:**
- Create: `frontend/src/components/ObservationForm.tsx`

**Step 1: Write the component**

```typescript
import { useState, useEffect } from 'react';
import ModelSelector from './ModelSelector';
import ResponseCard from './ResponseCard';
import type { Model, Tag } from '../types';

interface ObservationFormProps {
  editId?: string;
}

interface RunResult {
  modelId: string;
  model?: string;
  success: boolean;
  response?: string;
  error?: string;
  latencyMs?: number;
}

export default function ObservationForm({ editId }: ObservationFormProps) {
  const [prompt, setPrompt] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<string>('');
  const [cronExpression, setCronExpression] = useState('');
  const [wordLimit, setWordLimit] = useState(100);
  const [useWordLimit, setUseWordLimit] = useState(false);

  const [models, setModels] = useState<Model[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedObservationId, setSavedObservationId] = useState<string | null>(null);

  const isEditMode = Boolean(editId);

  // Load models and tags
  useEffect(() => {
    Promise.all([
      fetch('/api/models').then((r) => r.json()),
      fetch('/api/tags').then((r) => r.json()),
    ]).then(([modelsData, tagsData]) => {
      setModels(modelsData.models || []);
      setTags(tagsData.tags || []);

      // Smart default model selection (one per company)
      if (!editId) {
        const defaultModels = selectDefaultModels(modelsData.models || []);
        setSelectedModels(defaultModels);
      }
    });
  }, [editId]);

  // Load existing observation if editing
  useEffect(() => {
    if (editId) {
      fetch(`/api/observations/${editId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.observation) {
            setPrompt(data.observation.prompt_text);
            setDisplayName(data.observation.display_name || '');
            setSelectedModels(data.observation.models?.map((m: { id: string }) => m.id) || []);
            setSelectedTags(data.observation.tags?.map((t: { id: string }) => t.id) || []);
            setScheduleType(data.observation.schedule_type || '');
            setCronExpression(data.observation.cron_expression || '');
          }
        });
    }
  }, [editId]);

  const selectDefaultModels = (allModels: Model[]): string[] => {
    const byCompany = new Map<string, Model[]>();
    allModels.forEach((m) => {
      const list = byCompany.get(m.company) || [];
      list.push(m);
      byCompany.set(m.company, list);
    });

    const defaults: string[] = [];
    byCompany.forEach((companyModels) => {
      // Pick the first model per company (they're ordered by recency)
      if (companyModels.length > 0) {
        defaults.push(companyModels[0].id);
      }
    });
    return defaults;
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      const data = await res.json();
      if (data.tag) {
        setTags([...tags, data.tag]);
        setSelectedTags([...selectedTags, data.tag.id]);
        setNewTagName('');
        setShowNewTagInput(false);
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || selectedModels.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    setResults([]);
    setSavedObservationId(null);

    try {
      const endpoint = editId ? `/api/observations/${editId}` : '/api/observations';
      const method = editId ? 'PUT' : 'POST';

      const body = editId
        ? {
            display_name: displayName || undefined,
            tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
            model_ids: selectedModels,
            schedule_type: scheduleType || null,
            cron_expression: scheduleType === 'custom' ? cronExpression : null,
          }
        : {
            prompt_text: prompt,
            model_ids: selectedModels,
            display_name: displayName || undefined,
            tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
            schedule_type: scheduleType || null,
            cron_expression: scheduleType === 'custom' ? cronExpression : null,
            word_limit: useWordLimit ? wordLimit : undefined,
          };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save observation');
      }

      if (data.results) {
        // Map results to include model display names
        const mappedResults = data.results.map((r: RunResult) => {
          const model = models.find((m) => m.id === r.modelId);
          return { ...r, model: model?.display_name || r.modelId };
        });
        setResults(mappedResults);
      }

      setSavedObservationId(data.observation?.id);

      if (!editId) {
        // Clear form for new observations
        setPrompt('');
        setDisplayName('');
        setSelectedTags([]);
        setScheduleType('');
        setCronExpression('');
        setUseWordLimit(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Prompt */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt..."
            rows={4}
            disabled={isEditMode}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber/50 disabled:bg-paper-dark disabled:cursor-not-allowed"
          />
          {isEditMode && (
            <p className="text-xs text-ink-muted mt-1">
              Prompt cannot be edited. Create a new observation to change the prompt.
            </p>
          )}
        </div>

        {/* Word Limit */}
        {!isEditMode && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={useWordLimit}
                onChange={(e) => setUseWordLimit(e.target.checked)}
                className="rounded border-border text-amber focus:ring-amber"
              />
              Limit response to
            </label>
            <input
              type="number"
              value={wordLimit}
              onChange={(e) => setWordLimit(parseInt(e.target.value) || 100)}
              min={1}
              max={10000}
              disabled={!useWordLimit}
              className="w-20 px-2 py-1 border border-border rounded text-sm disabled:opacity-50"
            />
            <span className="text-sm text-ink-muted">words</span>
          </div>
        )}

        {/* Model Selector */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Models</label>
          <ModelSelector
            models={models}
            selectedModels={selectedModels}
            onSelectionChange={setSelectedModels}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Tags (optional)</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className={`px-3 py-1 rounded-full text-sm cursor-pointer transition-colors ${
                  selectedTags.includes(tag.id)
                    ? 'bg-amber text-white'
                    : 'bg-paper-dark text-ink hover:bg-paper-darker'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTags([...selectedTags, tag.id]);
                    } else {
                      setSelectedTags(selectedTags.filter((id) => id !== tag.id));
                    }
                  }}
                  className="sr-only"
                />
                {tag.name}
              </label>
            ))}
            {!showNewTagInput ? (
              <button
                type="button"
                onClick={() => setShowNewTagInput(true)}
                className="px-3 py-1 rounded-full text-sm bg-paper-dark text-ink-muted hover:bg-paper-darker"
              >
                + New Tag
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name"
                  className="px-2 py-1 border border-border rounded text-sm w-32"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateTag}
                  className="px-2 py-1 text-sm bg-amber text-white rounded"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTagInput(false);
                    setNewTagName('');
                  }}
                  className="px-2 py-1 text-sm text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Schedule (optional)</label>
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber/50"
          >
            <option value="">None (run once)</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom (cron)</option>
          </select>
          {scheduleType === 'custom' && (
            <input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 6 * * * (6am UTC daily)"
              className="mt-2 px-3 py-2 border border-border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber/50"
            />
          )}
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            Display Name (optional)
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Auto-generated from prompt if empty"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber/50"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-error text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || !prompt.trim() || selectedModels.length === 0}
          className="w-full py-3 bg-amber text-white rounded-lg font-medium hover:bg-amber-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? 'Running...'
            : isEditMode
              ? 'Save Changes'
              : `Run Observation (${selectedModels.length} models)`}
        </button>
      </form>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-ink">Results</h3>
            {savedObservationId && (
              <a
                href={`/collect/${savedObservationId}`}
                className="text-sm text-amber hover:text-amber-dark"
              >
                View Observation →
              </a>
            )}
          </div>
          <div className="grid gap-4">
            {results.map((result, i) => (
              <ResponseCard
                key={i}
                modelName={result.model || result.modelId}
                response={result.response}
                error={result.error}
                latencyMs={result.latencyMs}
                isLoading={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add Tag type to frontend types**

In `frontend/src/types.ts`, add:
```typescript
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}
```

**Step 3: Run build to verify no errors**

Run: `npm run build:frontend`
Expected: Success

**Step 4: Commit**

```bash
git add frontend/src/components/ObservationForm.tsx frontend/src/types.ts
git commit -m "Add ObservationForm component"
```

---

## Phase 6: Frontend - Update App Routes

### Task 6.1: Update App.tsx with new routes and navigation

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Update imports**

Replace `CollectionForm` import with:
```typescript
import ObservationForm from './components/ObservationForm';
```

Remove `PromptLab` import.

**Step 2: Update CollectNavTabs**

Replace the CollectNavTabs function:
```typescript
function CollectNavTabs() {
  const pathname = window.location.pathname;
  const isManageActive = pathname === '/collect/manage' ||
    (pathname.startsWith('/collect/') && pathname !== '/collect' && !pathname.match(/^\/collect\/[^/]+$/));

  return (
    <div className="flex gap-1 mb-6 border-b border-border">
      <NavLink
        to="/collect"
        end
        className={({ isActive }) =>
          `px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            isActive ? 'border-amber text-amber' : 'border-transparent text-ink-muted hover:text-ink'
          }`
        }
      >
        New
      </NavLink>
      <NavLink
        to="/collect/manage"
        className={() =>
          `px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            isManageActive ? 'border-amber text-amber' : 'border-transparent text-ink-muted hover:text-ink'
          }`
        }
      >
        Manage
      </NavLink>
    </div>
  );
}
```

**Step 3: Update CollectCreatePage to use ObservationForm**

Replace CollectCreatePage:
```typescript
function CollectNewPage() {
  return (
    <div>
      <CollectNavTabs />
      <ObservationForm />
    </div>
  );
}
```

**Step 4: Update navigation in Layout**

Remove the Prompt Lab NavLink from the nav.

**Step 5: Update Routes**

Replace the routes:
```typescript
<Routes>
  <Route path="/" element={<Landing />} />
  {/* Collect routes */}
  <Route path="/collect" element={<CollectNewPage />} />
  <Route path="/collect/manage" element={<CollectManagePage />} />
  <Route path="/collect/:id" element={<CollectionDetailPage />} />
  {/* Browse routes */}
  <Route path="/browse" element={<Navigate to="/browse/prompts" replace />} />
  <Route path="/browse/prompts" element={<BrowsePromptsPage />} />
</Routes>
```

**Step 6: Run build and lint**

Run: `npm run build:frontend && npm run lint`
Expected: Success

**Step 7: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "Update routes and navigation for unified observations"
```

---

## Phase 7: Update Landing Page

### Task 7.1: Update Landing page cards

**Files:**
- Modify: `frontend/src/pages/Landing.tsx`

**Step 1: Update the cards**

Remove the Prompt Lab card and update the Collect card description:
```typescript
// In the cards array or JSX, update to:
<Link to="/collect" className="...">
  <h3>Collect</h3>
  <p>Run prompts across models, save observations, schedule recurring runs</p>
</Link>
```

**Step 2: Run build**

Run: `npm run build:frontend`
Expected: Success

**Step 3: Commit**

```bash
git add frontend/src/pages/Landing.tsx
git commit -m "Update landing page for unified observations"
```

---

## Phase 8: Cleanup

### Task 8.1: Remove PromptLab.tsx

**Files:**
- Delete: `frontend/src/pages/PromptLab.tsx`

**Step 1: Delete the file**

Run: `rm frontend/src/pages/PromptLab.tsx`

**Step 2: Verify build still works**

Run: `npm run build:frontend`
Expected: Success

**Step 3: Commit**

```bash
git add -A
git commit -m "Remove deprecated PromptLab page"
```

---

### Task 8.2: Apply all migrations to remote database

**Step 1: Apply migrations to remote**

Run each migration:
```bash
npx wrangler d1 execute llm-observatory-db --remote --file=./migrations/0002_create_tags.sql
npx wrangler d1 execute llm-observatory-db --remote --file=./migrations/0003_create_observations.sql
npx wrangler d1 execute llm-observatory-db --remote --file=./migrations/0004_create_observation_tags.sql
npx wrangler d1 execute llm-observatory-db --remote --file=./migrations/0005_create_observation_versions.sql
npx wrangler d1 execute llm-observatory-db --remote --file=./migrations/0006_create_observation_version_models.sql
```

Expected: Each returns success

---

## Phase 9: Testing & Verification

### Task 9.1: Run all tests

**Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass

### Task 9.2: Manual verification with Playwright

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Verify with browser**

Use Playwright MCP to:
1. Navigate to `/collect`
2. Enter a prompt
3. Select models
4. Run observation
5. Verify results appear
6. Navigate to `/collect/manage`
7. Verify observation appears in list

---

## Final: Push and Update PR

**Step 1: Push all changes**

```bash
git push
```

**Step 2: Update PR description**

Update PR #30 with implementation status.
