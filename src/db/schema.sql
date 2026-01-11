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
    input_price_per_m REAL,               -- Cost per million input tokens (USD)
    output_price_per_m REAL,              -- Cost per million output tokens (USD)
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
