-- Initial topics (minimal set for MVP)
INSERT OR IGNORE INTO topics (id, name, category) VALUES
  ('openai', 'OpenAI', 'company'),
  ('anthropic', 'Anthropic', 'company'),
  ('climate-change', 'Climate Change', 'concept');

-- Initial models (four providers for MVP)
INSERT OR IGNORE INTO models (id, provider, model_name, display_name) VALUES
  ('openai-gpt4o', 'openai', 'gpt-4o', 'GPT-4o'),
  ('anthropic-claude-sonnet', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet'),
  ('google-gemini-flash', 'google', 'gemini-2.0-flash', 'Gemini 2.0 Flash'),
  ('cloudflare-llama', 'cloudflare', '@cf/meta/llama-3.1-8b-instruct-fast', 'Llama 3.1 8B');
