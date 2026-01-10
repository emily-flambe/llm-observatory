-- Initial topics (minimal set for MVP)
INSERT OR IGNORE INTO topics (id, name, description) VALUES
  ('climate-change', 'Climate Change', 'Global warming and environmental policy');

-- Initial prompt templates
INSERT OR IGNORE INTO prompt_templates (id, name, template, description) VALUES
  ('static', 'Static Opinion', 'Without doing any new research, what do you think about {topic}? Keep your response to less than 200 words.', 'Ask for opinion based on training data only');

-- Initial models (four providers for MVP)
INSERT OR IGNORE INTO models (id, provider, model_name, display_name) VALUES
  ('openai-gpt4o', 'openai', 'gpt-4o', 'GPT-4o'),
  ('anthropic-claude-sonnet', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet'),
  ('google-gemini-flash', 'google', 'gemini-2.0-flash', 'Gemini 2.0 Flash'),
  ('cloudflare-llama', 'cloudflare', '@cf/meta/llama-3.1-8b-instruct-fast', 'Llama 3.1 8B');
