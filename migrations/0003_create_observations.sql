-- Observations: saved prompts that can run on schedule
CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    prompt_text TEXT NOT NULL,
    display_name TEXT,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_run_at TEXT
);
