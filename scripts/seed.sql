-- Initial topics (minimal set for MVP)
INSERT OR IGNORE INTO topics (id, name, description) VALUES
  ('climate-change', 'Climate Change', 'Global warming and environmental policy'),
  ('cats', 'Cats', 'Domestic cats and feline behavior');

-- Initial prompt templates
INSERT OR IGNORE INTO prompt_templates (id, name, template, description) VALUES
  ('static', 'Static Opinion', 'Without doing any new research, what do you think about {topic}? Keep your response to less than 200 words.', 'Ask for opinion based on training data only');

-- Initial models (four providers for MVP)
INSERT OR IGNORE INTO models (id, provider, model_name, display_name) VALUES
  ('openai-gpt4o', 'openai', 'gpt-4o', 'GPT-4o'),
  ('anthropic-claude-sonnet', 'anthropic', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5'),
  ('google-gemini-flash', 'google', 'gemini-2.0-flash', 'Gemini 2.0 Flash'),
  ('cloudflare-llama', 'cloudflare', '@cf/meta/llama-3.1-8b-instruct-fast', 'Llama 3.1 8B'),
  ('cloudflare-llama4-scout', 'cloudflare', '@cf/meta/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout 17B'),
  ('cloudflare-llama33-70b', 'cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'Llama 3.3 70B'),
  ('cloudflare-qwen3-30b', 'cloudflare', '@cf/qwen/qwen3-30b-a3b-fp8', 'Qwen3 30B'),
  ('cloudflare-qwq-32b', 'cloudflare', '@cf/qwen/qwq-32b', 'QwQ 32B'),
  ('cloudflare-mistral-small', 'cloudflare', '@cf/mistralai/mistral-small-3.1-24b-instruct', 'Mistral Small 3.1 24B'),
  ('cloudflare-gemma3-12b', 'cloudflare', '@cf/google/gemma-3-12b-it', 'Gemma 3 12B'),
  ('cloudflare-deepseek-r1', 'cloudflare', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', 'DeepSeek R1 32B'),
  ('xai-grok-3', 'xai', 'grok-3', 'Grok 3'),
  ('xai-grok-3-mini', 'xai', 'grok-3-mini', 'Grok 3 Mini');
