-- Add hide_from_history flag to observations
-- When set to 1, prompts from this swarm are hidden from the History view by default
ALTER TABLE observations ADD COLUMN hide_from_history INTEGER NOT NULL DEFAULT 0;
