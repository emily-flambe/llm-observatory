-- Add metadata columns to models table for Explore Models feature
ALTER TABLE models ADD COLUMN description TEXT;
ALTER TABLE models ADD COLUMN family TEXT;
ALTER TABLE models ADD COLUMN context_window INTEGER;
ALTER TABLE models ADD COLUMN max_output_tokens INTEGER;
ALTER TABLE models ADD COLUMN supports_reasoning INTEGER;
ALTER TABLE models ADD COLUMN supports_tool_calls INTEGER;
ALTER TABLE models ADD COLUMN supports_attachments INTEGER;
ALTER TABLE models ADD COLUMN open_weights INTEGER;
ALTER TABLE models ADD COLUMN input_modalities TEXT;
ALTER TABLE models ADD COLUMN output_modalities TEXT;
