# Unified Observations Design

**Date:** 2026-01-14
**Status:** Approved
**Summary:** Unify Prompt Lab and Collect into a single "Collect" UI where all prompts are treated as "observations" - ad-hoc ones have no schedule, but can be revised later to recur.

## Goals

1. Eliminate the separate Prompt Lab UI
2. Simplify the data model by removing templates
3. Rename "collections" to "observations" (fits Observatory theme)
4. Replace single-topic with multi-select tags
5. Make scheduling optional (defaults to none/ad-hoc)

## Non-Goals

- Migrating existing collections to new schema
- Backfilling prompt-lab responses as observations
- Changing the Browse page significantly

---

## Data Model

### New Tables

```sql
-- Tags for categorization (replaces topics)
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,  -- hex for UI badges
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Core observation (replaces collections)
CREATE TABLE observations (
  id TEXT PRIMARY KEY,  -- UUID
  prompt_text TEXT NOT NULL,
  display_name TEXT,  -- optional
  disabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_run_at TEXT
);

-- Many-to-many: observations <-> tags
CREATE TABLE observation_tags (
  observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, tag_id)
);

-- Versioned config (models + schedule)
CREATE TABLE observation_versions (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  schedule_type TEXT,  -- 'daily', 'weekly', 'monthly', 'custom', NULL
  cron_expression TEXT,
  is_paused INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(observation_id, version)
);

-- Version <-> models join
CREATE TABLE observation_version_models (
  observation_version_id TEXT NOT NULL REFERENCES observation_versions(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id),
  PRIMARY KEY (observation_version_id, model_id)
);
```

### BigQuery Changes

New response records include:
- `observation_id` (replaces `collection_id`)
- `observation_version` (replaces `collection_version`)
- `tags` array field (replaces `topic_id`, `topic_name`)
- `source` = `'observation'` (replaces both `'collection'` and `'prompt-lab'`)

Old records retain their existing fields for backward compatibility in Browse.

### Tables Retained (Read-Only)

For Browse backward compatibility with old BigQuery data:
- `topics` - no new writes
- `prompt_templates` - no new writes
- `collections`, `collection_versions`, `collection_version_models` - no new writes

---

## Navigation & Routes

### Top-Level Navigation

- **Collect** - Primary action area
- **Browse** - Read-only exploration (unchanged)

### Collect Sub-Tabs

- **New** (`/collect`) - Create and run observations
- **Manage** (`/collect/manage`) - List/edit saved observations

### All Routes

```
/                    → Landing page (updated cards)
/collect             → New observation form + inline results
/collect/manage      → Observation list with filters
/collect/:id         → Edit observation (models, schedule, tags)
/collect/:id/history → View past runs for an observation
/browse              → Search/filter all responses (unchanged)
```

### Removed Routes

- `/prompt-lab` - Replaced by `/collect`

---

## UI Components

### New Observation Form (`/collect`)

**Layout (top to bottom):**

1. **Prompt textarea** - Large, prominent. Placeholder: "Enter your prompt..."

2. **Word limit** - Checkbox "Limit response to N words" + number input (default 100). Appends instruction to prompt when enabled.

3. **Model selector** - Checkboxes with "Select All" / "Clear All". Grouped by company. Smart defaults (one per company on initial load).

4. **Tags** (optional) - Multi-select dropdown with existing tags + "Create new tag" inline. Empty by default.

5. **Schedule** (optional) - Dropdown defaulting to "None (run once)". Options:
   - None (run once)
   - Daily
   - Weekly
   - Monthly
   - Custom (reveals cron input with "UTC" label)

6. **Display name** (optional) - Text input. If empty, auto-generate from first ~50 chars of prompt.

7. **Run button** - "Run Observation" with model count badge

**Results area (below form, after running):**

- Status spinner during execution
- Cards per model: model name, latency badge, markdown-rendered response, error state
- "Saved as observation" link to `/collect/:id`

Form clears after successful run.

### Manage Observations (`/collect/manage`)

**Filters bar:**
- Search input (prompt text, display name)
- Tags multi-select dropdown
- Status dropdown: All, Active, Manual, Paused, Disabled
- "Show disabled" toggle (off by default)

**Observation cards:**
- Display name (or truncated prompt)
- Tags as colored badges
- Schedule indicator + next run time
- Last run timestamp
- Model count
- Status badge
- Click → `/collect/:id`

**Card actions (kebab menu):**
- Run now
- Pause/Resume
- Disable
- Restore

### Edit Observation (`/collect/:id`)

**Header:**
- Editable display name
- Status badge
- "Run Now" button

**Sections:**

1. **Prompt** (read-only) - Full text displayed. Immutable to preserve historical comparisons.

2. **Models** (editable) - Checkbox UI. Changes create new version.

3. **Tags** (editable) - Multi-select. Changes save immediately (no versioning).

4. **Schedule** (editable) - Dropdown + cron. "Pause" toggle. Changes create new version.

5. **Version History** (collapsible) - List with timestamps and change descriptions.

6. **Recent Results** (collapsible) - Last N runs. Link to full history.

**Danger zone:**
- "Disable Observation" button

---

## API Endpoints

### Tags

```
GET    /api/tags                    → { tags: Tag[] }
POST   /api/tags                    → { tag: Tag }
DELETE /api/tags/:id                → { success: boolean }
```

### Observations

```
GET    /api/observations            → { observations: ObservationWithDetails[] }
         ?includeDisabled=false
         ?tags=tag1,tag2
         ?search=query

GET    /api/observations/:id        → { observation: ObservationDetail }

POST   /api/observations            → Create + run immediately
         Body: { prompt_text, model_ids[], display_name?, tag_ids?,
                 schedule_type?, cron_expression?, word_limit? }
         Returns: { observation, results: RunResult[] }

PUT    /api/observations/:id        → Update (creates version if needed)
         Body: { display_name?, tag_ids?, model_ids?, schedule_type?,
                 cron_expression?, is_paused? }
         Returns: { observation, new_version: boolean }

DELETE /api/observations/:id        → Soft delete
PUT    /api/observations/:id/restore → Restore
```

### Running

```
POST   /api/observations/:id/run    → { observation_id, results[], successful, failed }
```

### History

```
GET    /api/observations/:id/responses?limit=100 → { responses[] }
```

### Browse (Updated)

```
GET    /api/prompts
         ?tags=tag1,tag2            (replaces ?topics=)
         ?sources= removed          (all are 'observation' now)
```

### Deprecated Endpoints

Keep for backward compatibility but no new functionality:
- `GET /api/topics`
- `GET /api/prompt-templates`
- `GET /api/collections` (read-only)

Remove entirely:
- `POST /api/admin/prompt` (Prompt Lab backend)
- `POST /api/topics`
- `POST /api/prompt-templates`
- `POST /api/collections`
- `PUT /api/collections/:id`
- `DELETE /api/collections/:id`

---

## Migration Plan

### New Migration Files

```
migrations/
  0004_create_tags.sql
  0005_create_observations.sql
  0006_create_observation_tags.sql
  0007_create_observation_versions.sql
  0008_create_observation_version_models.sql
```

### Frontend Changes

**Delete:**
- `frontend/pages/PromptLab.tsx`
- Prompt Lab related components

**Rewrite:**
- `frontend/pages/Collect.tsx` → New observation form
- `frontend/pages/CollectManage.tsx` → Observation list
- `frontend/pages/CollectEdit.tsx` → Observation detail

**Modify:**
- `frontend/components/Nav.tsx` → Remove Prompt Lab link
- `frontend/pages/Landing.tsx` → Update cards

### Backend Changes

**Add:**
- `src/services/observations.ts`
- `src/services/tags.ts`
- `src/routes/observations.ts`
- `src/routes/tags.ts`

**Deprecate (keep GET, remove mutations):**
- `src/routes/collections.ts`
- `src/routes/topics.ts`
- `src/routes/prompt-templates.ts`

---

## Data Migration

**Approach:** Clean break

- New tables, fresh start
- Old data remains queryable in BigQuery via Browse
- Old collections not manageable in new UI
- No backfill of prompt-lab responses

This simplifies implementation and avoids complex migration logic.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Drop templates | Simplifies model; users write prompts directly |
| Multi-select tags | More flexible than single topic |
| Single-page form | Minimal friction for quick tests |
| Inline results | Mirrors current Prompt Lab UX |
| Immutable prompts | Preserves historical comparison validity |
| Versioned models/schedule | Tracks configuration changes over time |
| "Observations" naming | Fits Observatory theme |
| Clean break migration | Simpler than data migration |
