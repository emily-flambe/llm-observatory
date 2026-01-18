-- Observation runs: each execution of an observation
CREATE TABLE IF NOT EXISTS observation_runs (
    id TEXT PRIMARY KEY,
    observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    observation_version INTEGER NOT NULL,
    run_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for fast lookup by observation
CREATE INDEX IF NOT EXISTS idx_observation_runs_observation_id ON observation_runs(observation_id);

-- Results for each run (one per model)
CREATE TABLE IF NOT EXISTS observation_run_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES observation_runs(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL REFERENCES models(id),
    response TEXT,
    error TEXT,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 0
);

-- Index for fast lookup by run
CREATE INDEX IF NOT EXISTS idx_observation_run_results_run_id ON observation_run_results(run_id);
