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
