-- Pricing updates for models (USD per million tokens)
-- Sources: Provider pricing pages as of Jan 2026

-- Anthropic Claude models
UPDATE models SET input_price_per_m = 0.25, output_price_per_m = 1.25 WHERE id = 'anthropic-claude-3-haiku-20240307';
UPDATE models SET input_price_per_m = 0.80, output_price_per_m = 4.00 WHERE id = 'anthropic-claude-3-5-haiku-20241022';
UPDATE models SET input_price_per_m = 1.00, output_price_per_m = 5.00 WHERE id = 'anthropic-claude-haiku-4-5-20251001';
UPDATE models SET input_price_per_m = 3.00, output_price_per_m = 15.00 WHERE id = 'anthropic-claude-3-7-sonnet-20250219';
UPDATE models SET input_price_per_m = 3.00, output_price_per_m = 15.00 WHERE id = 'anthropic-claude-sonnet-4-20250514';
UPDATE models SET input_price_per_m = 3.00, output_price_per_m = 15.00 WHERE id = 'anthropic-claude-sonnet-4-5-20250929';
UPDATE models SET input_price_per_m = 15.00, output_price_per_m = 75.00 WHERE id = 'anthropic-claude-opus-4-20250514';
UPDATE models SET input_price_per_m = 15.00, output_price_per_m = 75.00 WHERE id = 'anthropic-claude-opus-4-1-20250805';
UPDATE models SET input_price_per_m = 15.00, output_price_per_m = 75.00 WHERE id = 'anthropic-claude-opus-4-5-20251101';

-- Cloudflare Workers AI models (from issue #1)
UPDATE models SET input_price_per_m = 0.03, output_price_per_m = 0.20 WHERE id = 'cloudflare-llama';
UPDATE models SET input_price_per_m = 0.10, output_price_per_m = 0.50 WHERE id = 'cloudflare-gemma3-12b';
UPDATE models SET input_price_per_m = 0.15, output_price_per_m = 0.80 WHERE id = 'cloudflare-llama4-scout';
UPDATE models SET input_price_per_m = 0.20, output_price_per_m = 1.00 WHERE id = 'cloudflare-mistral-small';
UPDATE models SET input_price_per_m = 0.30, output_price_per_m = 1.50 WHERE id = 'cloudflare-qwq-32b';
UPDATE models SET input_price_per_m = 0.50, output_price_per_m = 4.88 WHERE id = 'cloudflare-deepseek-r1';
UPDATE models SET input_price_per_m = 0.29, output_price_per_m = 2.25 WHERE id = 'cloudflare-llama33-70b';

-- Google Gemini models
UPDATE models SET input_price_per_m = 0.10, output_price_per_m = 0.40 WHERE model_name LIKE 'gemini-2.0-flash%';
UPDATE models SET input_price_per_m = 0.075, output_price_per_m = 0.30 WHERE model_name LIKE 'gemini-2.0-flash-lite%';
UPDATE models SET input_price_per_m = 0.15, output_price_per_m = 0.60 WHERE model_name LIKE 'gemini-2.5-flash%' AND model_name NOT LIKE '%lite%';
UPDATE models SET input_price_per_m = 0.075, output_price_per_m = 0.30 WHERE model_name LIKE 'gemini-2.5-flash-lite%';
UPDATE models SET input_price_per_m = 1.25, output_price_per_m = 5.00 WHERE model_name LIKE 'gemini-2.5-pro%';
UPDATE models SET input_price_per_m = 0.15, output_price_per_m = 0.60 WHERE model_name LIKE 'gemini-3-flash%';
UPDATE models SET input_price_per_m = 1.25, output_price_per_m = 5.00 WHERE model_name LIKE 'gemini-3-pro%';

-- OpenAI GPT models
UPDATE models SET input_price_per_m = 0.50, output_price_per_m = 1.50 WHERE model_name LIKE 'gpt-3.5-turbo%';
UPDATE models SET input_price_per_m = 30.00, output_price_per_m = 60.00 WHERE model_name = 'gpt-4' OR model_name = 'gpt-4-0613';
UPDATE models SET input_price_per_m = 10.00, output_price_per_m = 30.00 WHERE model_name LIKE 'gpt-4-turbo%' OR model_name LIKE 'gpt-4-0125%' OR model_name LIKE 'gpt-4-1106%';
UPDATE models SET input_price_per_m = 2.50, output_price_per_m = 10.00 WHERE model_name LIKE 'gpt-4o' OR model_name LIKE 'gpt-4o-2024%';
UPDATE models SET input_price_per_m = 0.15, output_price_per_m = 0.60 WHERE model_name LIKE 'gpt-4o-mini%';
UPDATE models SET input_price_per_m = 2.00, output_price_per_m = 8.00 WHERE model_name LIKE 'gpt-4.1' OR model_name LIKE 'gpt-4.1-2025%';
UPDATE models SET input_price_per_m = 0.40, output_price_per_m = 1.60 WHERE model_name LIKE 'gpt-4.1-mini%';
UPDATE models SET input_price_per_m = 0.10, output_price_per_m = 0.40 WHERE model_name LIKE 'gpt-4.1-nano%';
UPDATE models SET input_price_per_m = 5.00, output_price_per_m = 15.00 WHERE model_name LIKE 'gpt-5' OR model_name LIKE 'gpt-5-2025%';
UPDATE models SET input_price_per_m = 1.00, output_price_per_m = 4.00 WHERE model_name LIKE 'gpt-5-mini%';
UPDATE models SET input_price_per_m = 0.25, output_price_per_m = 1.00 WHERE model_name LIKE 'gpt-5-nano%';
UPDATE models SET input_price_per_m = 10.00, output_price_per_m = 40.00 WHERE model_name LIKE 'gpt-5-pro%';
UPDATE models SET input_price_per_m = 5.00, output_price_per_m = 15.00 WHERE model_name LIKE 'gpt-5.1%';
UPDATE models SET input_price_per_m = 5.00, output_price_per_m = 15.00 WHERE model_name LIKE 'gpt-5.2%';

-- OpenAI o-series reasoning models
UPDATE models SET input_price_per_m = 15.00, output_price_per_m = 60.00 WHERE model_name = 'o1' OR model_name LIKE 'o1-2024%';
UPDATE models SET input_price_per_m = 150.00, output_price_per_m = 600.00 WHERE model_name LIKE 'o1-pro%';
UPDATE models SET input_price_per_m = 10.00, output_price_per_m = 40.00 WHERE model_name = 'o3' OR model_name LIKE 'o3-2025%';
UPDATE models SET input_price_per_m = 1.10, output_price_per_m = 4.40 WHERE model_name LIKE 'o3-mini%';
UPDATE models SET input_price_per_m = 1.10, output_price_per_m = 4.40 WHERE model_name LIKE 'o4-mini%';

-- xAI Grok models
UPDATE models SET input_price_per_m = 3.00, output_price_per_m = 15.00 WHERE model_name = 'grok-3';
UPDATE models SET input_price_per_m = 0.30, output_price_per_m = 0.50 WHERE model_name = 'grok-3-mini';
UPDATE models SET input_price_per_m = 5.00, output_price_per_m = 25.00 WHERE model_name LIKE 'grok-4%';
UPDATE models SET input_price_per_m = 2.00, output_price_per_m = 10.00 WHERE model_name LIKE 'grok-2%';
