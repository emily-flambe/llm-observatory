-- Topics to track
CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- LLM model configurations
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    active INTEGER DEFAULT 1
);

-- Raw responses from LLMs
CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    raw_response TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    latency_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    error TEXT,

    FOREIGN KEY (topic_id) REFERENCES topics(id),
    FOREIGN KEY (model_id) REFERENCES models(id)
);

CREATE INDEX IF NOT EXISTS idx_responses_topic ON responses(topic_id);
CREATE INDEX IF NOT EXISTS idx_responses_model ON responses(model_id);
CREATE INDEX IF NOT EXISTS idx_responses_collected ON responses(collected_at);
