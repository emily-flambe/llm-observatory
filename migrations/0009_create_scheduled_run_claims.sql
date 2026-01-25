-- Deduplication table for scheduled swarm runs
-- Uses UNIQUE constraint to ensure only one worker can claim a scheduled run,
-- even with D1's eventual consistency across regions
CREATE TABLE IF NOT EXISTS scheduled_run_claims (
    id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,  -- ISO timestamp truncated to minute (e.g., "2026-01-22T06:00")
    claimed_at TEXT NOT NULL,
    UNIQUE(swarm_id, scheduled_for)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_scheduled_run_claims_scheduled_for ON scheduled_run_claims(scheduled_for);
