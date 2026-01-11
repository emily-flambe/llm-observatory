-- LLM Observatory D1 Schema
-- Note: Responses are stored in BigQuery, not D1

-- Topics to track
CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Prompt templates
CREATE TABLE IF NOT EXISTS prompt_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    template TEXT NOT NULL,
    description TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- LLM model configurations
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    model_type TEXT DEFAULT 'chat',       -- 'chat', 'embedding', 'image'
    source TEXT DEFAULT 'manual',         -- 'auto' or 'manual'
    last_synced TEXT,                     -- ISO timestamp of last sync
    released_at TEXT,                     -- ISO timestamp of model release (from basellm)
    knowledge_cutoff TEXT,                -- Training data cutoff date (from basellm, e.g. "2024-04")
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Model sync log for tracking auto-sync results
CREATE TABLE IF NOT EXISTS model_sync_log (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    synced_at TEXT DEFAULT (datetime('now')),
    models_found INTEGER DEFAULT 0,
    models_added INTEGER DEFAULT 0,
    error TEXT
);

-- Rate limiting (daily request counts)
CREATE TABLE IF NOT EXISTS rate_limits (
    date TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_count INTEGER DEFAULT 0,
    PRIMARY KEY (date, endpoint)
);

-- Collections: reusable prompt configurations that can run on a schedule
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,                                          -- UUID
    topic_id TEXT NOT NULL REFERENCES topics(id),
    template_id TEXT NOT NULL REFERENCES prompt_templates(id),
    prompt_text TEXT NOT NULL,                                    -- Rendered prompt (immutable snapshot)
    display_name TEXT,                                            -- Optional custom name, null = auto-generate
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_run_at TEXT                                              -- Updated after each run
);

-- Collection versions: versioned mutable configuration (models, schedule)
CREATE TABLE IF NOT EXISTS collection_versions (
    id TEXT PRIMARY KEY,                                          -- UUID
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    schedule_type TEXT,                                           -- 'daily' | 'weekly' | 'monthly' | 'custom' | null
    cron_expression TEXT,                                         -- UTC cron, null if no schedule
    is_paused INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(collection_id, version)
);

-- Models assigned to each collection version
CREATE TABLE IF NOT EXISTS collection_version_models (
    collection_version_id TEXT NOT NULL REFERENCES collection_versions(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL REFERENCES models(id),
    PRIMARY KEY (collection_version_id, model_id)
);
