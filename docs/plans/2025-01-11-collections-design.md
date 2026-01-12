# Collections Feature Design

## Overview

Collections are reusable prompt configurations that can run on a schedule. When a user submits via the Collect UI, a Collection is created (or matched to an existing one). Collections have immutable prompt definitions and mutable configurations (models, schedule).

## Data Model

### D1 Tables

```sql
PRAGMA foreign_keys = ON;

-- Immutable collection definition
CREATE TABLE collections (
  id TEXT PRIMARY KEY,              -- UUID
  topic_id TEXT NOT NULL REFERENCES topics(id),
  template_id TEXT NOT NULL REFERENCES prompt_templates(id),
  prompt_text TEXT NOT NULL,        -- Rendered prompt (immutable snapshot)
  display_name TEXT,                -- Optional custom name, null = auto-generate from topic+template
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_at TEXT                  -- Updated after each run
);

-- Versioned mutable configuration
CREATE TABLE collection_versions (
  id TEXT PRIMARY KEY,              -- UUID
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  schedule_type TEXT,               -- 'daily' | 'weekly' | 'monthly' | 'custom' | null
  cron_expression TEXT,             -- UTC cron, null if no schedule
  is_paused INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(collection_id, version)
);

-- Models for each version
CREATE TABLE collection_version_models (
  collection_version_id TEXT NOT NULL REFERENCES collection_versions(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id),
  PRIMARY KEY (collection_version_id, model_id)
);
```

### BigQuery Changes

Add columns to responses table:
- `collection_id STRING` - References D1 collection
- `collection_version INTEGER` - Version at time of collection

Historical responses (before this feature) will have NULL for these fields.

## API Endpoints

### Collections CRUD

```
GET  /api/collections
     List all collections with current version info
     Response: { collections: [...] }

GET  /api/collections/:id
     Get single collection with full details
     Response: { collection: {..., models: [...], versions: [...]} }

POST /api/collections
     Create new collection (or return existing if topic+template match)
     Body: { topic_id, template_id, model_ids: [], display_name? }
     Response: { collection: {...}, created: boolean }

PUT  /api/collections/:id
     Update mutable fields (creates new version if models/schedule change)
     Body: { display_name?, model_ids?, schedule_type?, cron_expression?, is_paused? }
     Response: { collection: {...}, new_version: boolean }

DELETE /api/collections/:id
     Delete collection and all versions (cascade)
     Response: { success: true }
```

### Collection Execution

```
POST /api/collections/:id/run
     Manually trigger a collection run
     Auth: requires admin API key
     Response: { results: [{ model_id, success, latency_ms, error? }] }
```

### Changes to Existing Endpoints

`POST /api/admin/collect` refactored to:
1. Create or match collection via `POST /api/collections`
2. Run collection via `POST /api/collections/:id/run`

## UI Changes

### Browse Tab

1. Rename "Prompt History" to "Prompts"
2. Add "Collections" tab at `/browse/collections`

### Browse > Collections Page

List view showing all collections:

```
┌─────────────────────────────────────────────────────────────┐
│ Climate Change - Opinion                       ● Active     │
│ "What is your opinion on Climate Change?"                   │
│ 5 models · Weekly · Last run: Jan 10, 2025 09:00 UTC       │
└─────────────────────────────────────────────────────────────┘
```

Status indicators:
- `● Active` (green) - Has schedule, running
- `⏸ Paused` (yellow) - Has schedule, paused
- `○ Manual` (gray) - No schedule

Clicking a card shows collection details: prompt, models, schedule, run history.

### Collect Page

After submission, show link to view the collection in Browse.

Future: Add management UI within Collect page (see GitHub issue).

## Scheduling

### Cloudflare Cron Triggers

```toml
# wrangler.toml
[triggers]
crons = ["0 * * * *"]  # Check every hour
```

### Schedule Options

| Type | Cron Expression | Description |
|------|-----------------|-------------|
| Daily | `0 9 * * *` | Every day at 09:00 UTC |
| Weekly | `0 9 * * 1` | Every Monday at 09:00 UTC |
| Monthly | `0 9 1 * *` | First of month at 09:00 UTC |
| Custom | User-defined | Any valid cron expression |

All times are UTC (clearly labeled in UI).

### Scheduled Handler Logic

```typescript
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  // 1. Query collections where:
  //    - schedule_type is not null
  //    - is_paused = 0
  //    - cron_expression matches current UTC time

  // 2. For each matching collection:
  //    - Get current version's models
  //    - Run prompt against each model (parallel)
  //    - Store responses in BigQuery with collection_id + version
  //    - Update last_run_at in D1
}
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage split | D1 config, BigQuery responses | Config is relational, responses are analytics data |
| Versioning | Full version history | Responses link to exact config at run time |
| Historical backfill | None | Clean separation, simpler migration |
| Schedule execution | Cloudflare Cron Triggers | Native, no external deps |
| Time zone | UTC only | Simplicity, clarity |
| Collection identity | Topic + Template | Deduplication, prevents accidental duplicates |
| Naming | Auto-generate with override | Low friction, user control when needed |
| Pause mechanism | is_paused flag | Preserve cron expression when pausing |

## Migration Plan

1. D1: Create three new tables with foreign keys
2. BigQuery: Add collection_id and collection_version columns
3. Backend: Add /api/collections endpoints
4. Backend: Modify /api/admin/collect to create collections
5. Backend: Add cron trigger handler
6. Frontend: Rename "Prompt History" to "Prompts"
7. Frontend: Add Collections tab and page
8. Frontend: Link from Collect results to collection view
