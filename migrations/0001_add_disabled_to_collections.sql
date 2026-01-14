-- Add disabled column for soft-delete
ALTER TABLE collections ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
