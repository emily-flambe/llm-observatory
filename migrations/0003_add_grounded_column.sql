-- Add grounded column to models table for web search grounding support
ALTER TABLE models ADD COLUMN grounded INTEGER DEFAULT 0;
