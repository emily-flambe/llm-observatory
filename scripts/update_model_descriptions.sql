-- Rich model descriptions for the LLM Observatory
-- Provides detailed, informative descriptions of each model's capabilities

-- Anthropic Claude Models
UPDATE models SET description = 'Claude Haiku 3 is Anthropic''s fastest and most cost-effective model, optimized for simple tasks and high-volume use cases. Best for data extraction, customer support, and content moderation.' WHERE id = 'anthropic-claude-3-haiku-20240307';

UPDATE models SET description = 'Claude Haiku 3.5 offers 3x faster performance than Claude 3 Opus at a fraction of the cost. Features improved coding, reasoning, and tool use with a 200K context window.' WHERE id = 'anthropic-claude-3-5-haiku-20241022';

UPDATE models SET description = 'Claude Haiku 4.5 is Anthropic''s latest speed-optimized model with enhanced reasoning and coding capabilities. Ideal for real-time applications requiring quick responses at low cost.' WHERE id = 'anthropic-claude-haiku-4-5-20251001';

UPDATE models SET description = 'Claude Opus 4 is Anthropic''s most capable model for complex analysis, advanced coding, and nuanced content creation. Features extended thinking for step-by-step reasoning on difficult problems.' WHERE id = 'anthropic-claude-opus-4-20250514';

UPDATE models SET description = 'Claude Opus 4.1 builds on Opus 4 with improved multi-step reasoning, better code generation, and enhanced instruction following. Excels at research, analysis, and creative tasks.' WHERE id = 'anthropic-claude-opus-4-1-20250805';

UPDATE models SET description = 'Claude Opus 4.5 is Anthropic''s flagship model with breakthrough performance in coding, math, and complex reasoning. Features a 200K context window and superior long-form content generation.' WHERE id = 'anthropic-claude-opus-4-5-20251101';

UPDATE models SET description = 'Claude Opus 4.5 with web search capabilities for real-time information retrieval. Combines Anthropic''s most powerful reasoning with grounded, up-to-date responses.' WHERE id = 'anthropic-claude-opus-4-5-20251101-grounded';

UPDATE models SET description = 'Claude Sonnet 3.7 balances intelligence and speed with strong performance on coding, analysis, and reasoning tasks. Offers a 200K context window at a competitive price point.' WHERE id = 'anthropic-claude-3-7-sonnet-20250219';

UPDATE models SET description = 'Claude Sonnet 4 delivers Opus-level intelligence at Sonnet pricing. Features improved coding, multi-step reasoning, and enhanced instruction following for complex workflows.' WHERE id = 'anthropic-claude-sonnet-4-20250514';

UPDATE models SET description = 'Claude Sonnet 4.5 offers near-Opus performance with faster response times. Excels at coding, data analysis, and document processing with excellent price-performance ratio.' WHERE id = 'anthropic-claude-sonnet-4-5-20250929';

UPDATE models SET description = 'Claude Sonnet 4.5 with integrated web search for current information. Ideal for research tasks requiring both strong reasoning and real-time data access.' WHERE id = 'anthropic-claude-sonnet-4-5-20250929-grounded';

-- Cloudflare Workers AI Models
UPDATE models SET description = 'DeepSeek R1 32B Distilled is a reasoning-focused model distilled from DeepSeek R1. Provides strong mathematical and logical reasoning capabilities on Cloudflare''s global edge network.' WHERE id = 'cloudflare-deepseek-r1';

UPDATE models SET description = 'Gemma 3 12B is Google''s lightweight open-weights model hosted on Cloudflare. Offers efficient performance for general tasks with low latency on the edge.' WHERE id = 'cloudflare-gemma3-12b';

UPDATE models SET description = 'Llama 3.1 8B Instruct on Cloudflare delivers fast inference for general-purpose tasks. Ideal for chatbots, content generation, and simple reasoning at the edge.' WHERE id = 'cloudflare-llama';

UPDATE models SET description = 'Llama 3.3 70B on Cloudflare offers Meta''s most capable open model with strong reasoning, coding, and multilingual abilities. 128K context window with fast FP8 inference.' WHERE id = 'cloudflare-llama33-70b';

UPDATE models SET description = 'Llama 4 Scout 17B is Meta''s efficient mixture-of-experts model. Combines 16 expert networks for diverse task handling with lower computational costs.' WHERE id = 'cloudflare-llama4-scout';

UPDATE models SET description = 'Mistral Small 3.1 24B delivers strong multilingual capabilities with fast inference on Cloudflare. Excellent for European languages and efficient edge deployment.' WHERE id = 'cloudflare-mistral-small';

UPDATE models SET description = 'QwQ 32B is Alibaba''s reasoning model focused on mathematical and logical problem-solving. Features step-by-step reasoning chains for complex analytical tasks.' WHERE id = 'cloudflare-qwq-32b';

UPDATE models SET description = 'Qwen3 30B is Alibaba''s latest general-purpose model with strong coding and reasoning abilities. Offers competitive performance on Cloudflare''s edge network.' WHERE id = 'cloudflare-qwen3-30b';

-- DeepSeek Models
UPDATE models SET description = 'DeepSeek Chat is DeepSeek''s general-purpose conversational model optimized for dialogue, coding assistance, and everyday tasks at low cost.' WHERE id = 'deepseek-chat';

UPDATE models SET description = 'DeepSeek Chat is DeepSeek''s conversational AI model offering strong performance on coding and general tasks at competitive pricing.' WHERE id = 'deepseek-deepseek-chat';

UPDATE models SET description = 'DeepSeek R1 (Reasoner) is a breakthrough reasoning model using reinforcement learning. Excels at mathematics, coding, and complex logical reasoning with transparent chain-of-thought.' WHERE id = 'deepseek-reasoner';

UPDATE models SET description = 'DeepSeek R1 is DeepSeek''s flagship reasoning model trained with RL. Features explicit reasoning steps for mathematical proofs, code problems, and analytical tasks.' WHERE id = 'deepseek-deepseek-reasoner';

-- Google Gemini Models
UPDATE models SET description = 'Gemini 2.0 Flash is Google''s fast multimodal model with native image, audio, and code capabilities. Features a 1M token context window and efficient performance.' WHERE id = 'google-gemini-2-0-flash';

UPDATE models SET description = 'Gemini 2.0 Flash with experimental image generation capabilities. Can both understand and create images alongside text.' WHERE id = 'google-gemini-2-0-flash-exp-image-generation';

UPDATE models SET description = 'Gemini 2.0 Flash 001 is a versioned release of the Flash model for production stability. Offers consistent behavior for applications requiring reproducibility.' WHERE id = 'google-gemini-2-0-flash-001';

UPDATE models SET description = 'Gemini 2.0 Flash Experimental includes cutting-edge features being tested. May offer improved performance but with less stability than production releases.' WHERE id = 'google-gemini-2-0-flash-exp';

UPDATE models SET description = 'Gemini 2.0 Flash-Lite is optimized for high throughput and cost efficiency. Ideal for bulk processing and applications prioritizing speed over maximum capability.' WHERE id = 'google-gemini-2-0-flash-lite';

UPDATE models SET description = 'Gemini 2.0 Flash-Lite 001 is a versioned cost-efficient model for production use. Offers predictable performance for high-volume applications.' WHERE id = 'google-gemini-2-0-flash-lite-001';

UPDATE models SET description = 'Gemini 2.0 Flash-Lite Preview offers early access to upcoming Flash-Lite improvements. Suitable for testing and development environments.' WHERE id = 'google-gemini-2-0-flash-lite-preview';

UPDATE models SET description = 'Gemini 2.0 Flash-Lite Preview (02-05) is a dated preview release for evaluating specific improvements before production deployment.' WHERE id = 'google-gemini-2-0-flash-lite-preview-02-05';

UPDATE models SET description = 'Gemini 2.5 Computer Use Preview enables AI control of desktop applications. Can perform multi-step computer tasks with visual understanding.' WHERE id = 'google-gemini-2-5-computer-use-preview-10-2025';

UPDATE models SET description = 'Gemini 2.5 Flash combines speed with advanced reasoning and 1M token context. Features native tool use, code execution, and multimodal understanding.' WHERE id = 'google-gemini-2-5-flash';

UPDATE models SET description = 'Gemini 2.5 Flash with Google Search integration for real-time information. Provides grounded responses with source citations.' WHERE id = 'google-gemini-2-5-flash-grounded';

UPDATE models SET description = 'Gemini 2.5 Flash Preview (Sep 2025) offers early access to upcoming Flash improvements. Features enhanced reasoning and multimodal capabilities.' WHERE id = 'google-gemini-2-5-flash-preview-09-2025';

UPDATE models SET description = 'Gemini 2.5 Flash-Lite offers the fastest Gemini 2.5 experience optimized for cost and speed. Ideal for high-throughput applications with budget constraints.' WHERE id = 'google-gemini-2-5-flash-lite';

UPDATE models SET description = 'Gemini 2.5 Flash-Lite Preview (Sep 2025) provides early access to the cost-optimized Gemini model before general availability.' WHERE id = 'google-gemini-2-5-flash-lite-preview-09-2025';

UPDATE models SET description = 'Gemini 2.5 Pro is Google''s most capable model with breakthrough reasoning, coding, and multimodal abilities. Features 1M token context and advanced agentic capabilities.' WHERE id = 'google-gemini-2-5-pro';

UPDATE models SET description = 'Gemini 2.5 Pro with Google Search for real-time grounded responses. Combines Google''s most powerful model with live information access.' WHERE id = 'google-gemini-2-5-pro-grounded';

UPDATE models SET description = 'Gemini 3 Flash Preview offers early access to next-generation Flash capabilities. Features improved speed, reasoning, and multimodal performance.' WHERE id = 'google-gemini-3-flash-preview';

UPDATE models SET description = 'Gemini 3 Pro Preview showcases Google''s upcoming flagship model. Offers significantly enhanced reasoning, creativity, and technical capabilities.' WHERE id = 'google-gemini-3-pro-preview';

UPDATE models SET description = 'Gemini Experimental 1206 is a research release testing new model architectures. May show unexpected behavior but demonstrates cutting-edge capabilities.' WHERE id = 'google-gemini-exp-1206';

UPDATE models SET description = 'Gemini Flash Latest automatically points to the current Flash release. Use for applications that should always run the newest stable version.' WHERE id = 'google-gemini-flash-latest';

UPDATE models SET description = 'Gemini Flash-Lite Latest automatically tracks the current Flash-Lite release. Ideal for cost-sensitive applications needing automatic updates.' WHERE id = 'google-gemini-flash-lite-latest';

UPDATE models SET description = 'Gemini Pro Latest points to Google''s current Pro model release. Best for applications requiring top performance with automatic updates.' WHERE id = 'google-gemini-pro-latest';

UPDATE models SET description = 'Gemini Robotics-ER 1.5 Preview is designed for embodied robotics applications. Features enhanced spatial reasoning and action planning capabilities.' WHERE id = 'google-gemini-robotics-er-1-5-preview';

UPDATE models SET description = 'Gemini 2.5 Flash Image generates and edits images using the Flash architecture. Combines fast text generation with visual creation capabilities.' WHERE id = 'google-gemini-2-5-flash-image';

UPDATE models SET description = 'Gemini 2.5 Flash Image Preview offers early access to image generation features. May include experimental capabilities before stable release.' WHERE id = 'google-gemini-2-5-flash-image-preview';

UPDATE models SET description = 'Gemini 3 Pro Image Preview showcases advanced image generation with the Pro model. Features higher quality output and better instruction following.' WHERE id = 'google-gemini-3-pro-image-preview';

-- Legacy Google model (keeping for backward compatibility)
UPDATE models SET description = 'Gemini 2.0 Flash is Google''s fast multimodal model with native image, audio, and code capabilities. Features a 1M token context window and efficient performance.' WHERE id = 'google-gemini-flash';

-- OpenAI GPT Models
UPDATE models SET description = 'GPT-3.5 Turbo is OpenAI''s efficient general-purpose model. Offers fast responses for basic tasks like summarization, translation, and simple coding at low cost.' WHERE id = 'openai-gpt-3-5-turbo';

UPDATE models SET description = 'GPT-3.5 Turbo 0125 is a versioned release with improved instruction following. Offers consistent behavior for production applications.' WHERE id = 'openai-gpt-3-5-turbo-0125';

UPDATE models SET description = 'GPT-3.5 Turbo 1106 introduced JSON mode and improved function calling. A stable version for applications requiring reproducibility.' WHERE id = 'openai-gpt-3-5-turbo-1106';

UPDATE models SET description = 'GPT-3.5 Turbo 16K offers extended 16K context window for longer documents. Suitable for summarization and analysis of longer texts.' WHERE id = 'openai-gpt-3-5-turbo-16k';

UPDATE models SET description = 'GPT-4 is OpenAI''s breakthrough reasoning model with 8K context. Excels at complex analysis, coding, and nuanced text generation with strong safety features.' WHERE id = 'openai-gpt-4';

UPDATE models SET description = 'GPT-4 Turbo combines GPT-4''s intelligence with faster responses and lower cost. Features 128K context and knowledge up to April 2023.' WHERE id = 'openai-gpt-4-turbo';

UPDATE models SET description = 'GPT-4 Turbo 2024.04.09 is a versioned release with improved consistency. Recommended for production applications requiring stable behavior.' WHERE id = 'openai-gpt-4-turbo-2024-04-09';

UPDATE models SET description = 'GPT-4 Turbo Preview offered early access to Turbo capabilities before general availability. May be deprecated in favor of stable releases.' WHERE id = 'openai-gpt-4-turbo-preview';

UPDATE models SET description = 'GPT-4 0125 Preview is a dated preview release used for testing specific improvements. Suitable for development and evaluation.' WHERE id = 'openai-gpt-4-0125-preview';

UPDATE models SET description = 'GPT-4 0613 is the original GPT-4 release from June 2023. Provides a stable baseline for comparison with newer models.' WHERE id = 'openai-gpt-4-0613';

UPDATE models SET description = 'GPT-4 1106 Preview introduced reproducible outputs, JSON mode, and parallel function calling. A milestone release for structured outputs.' WHERE id = 'openai-gpt-4-1106-preview';

UPDATE models SET description = 'GPT-4.1 delivers significant improvements in instruction following, coding, and structured outputs. Features enhanced tool use and longer context retention.' WHERE id = 'openai-gpt-4-1';

UPDATE models SET description = 'GPT-4.1 Mini offers GPT-4.1 capabilities at reduced cost. Ideal for high-volume applications requiring strong reasoning at a budget.' WHERE id = 'openai-gpt-4-1-mini';

UPDATE models SET description = 'GPT-4.1 Mini 2025.04.14 is a versioned release for production stability. Offers consistent Mini model behavior.' WHERE id = 'openai-gpt-4-1-mini-2025-04-14';

UPDATE models SET description = 'GPT-4.1 Nano is OpenAI''s most cost-efficient model with strong basic capabilities. Optimized for simple tasks at scale.' WHERE id = 'openai-gpt-4-1-nano';

UPDATE models SET description = 'GPT-4.1 Nano 2025.04.14 is a versioned Nano release for applications requiring stability and cost efficiency.' WHERE id = 'openai-gpt-4-1-nano-2025-04-14';

UPDATE models SET description = 'GPT-4.1 2025.04.14 is a versioned release of the full GPT-4.1 model for production use.' WHERE id = 'openai-gpt-4-1-2025-04-14';

UPDATE models SET description = 'GPT-4o is OpenAI''s flagship multimodal model with native vision, audio, and text capabilities. Features fast responses and strong reasoning in a unified architecture.' WHERE id = 'openai-gpt-4o';

UPDATE models SET description = 'GPT-4o 2024.05.13 is the initial GPT-4o release. Established the multimodal standard with integrated vision and audio.' WHERE id = 'openai-gpt-4o-2024-05-13';

UPDATE models SET description = 'GPT-4o 2024.08.06 introduced structured outputs for guaranteed JSON responses. Improved reliability for applications requiring specific formats.' WHERE id = 'openai-gpt-4o-2024-08-06';

UPDATE models SET description = 'GPT-4o 2024.11.20 features enhanced creative writing, improved instruction following, and better handling of complex prompts.' WHERE id = 'openai-gpt-4o-2024-11-20';

UPDATE models SET description = 'GPT-4o Mini offers GPT-4o multimodal capabilities at 60% lower cost. Ideal for applications needing vision and text at scale.' WHERE id = 'openai-gpt-4o-mini';

UPDATE models SET description = 'GPT-4o Mini 2024.07.18 is a versioned release providing stable multimodal performance at reduced cost.' WHERE id = 'openai-gpt-4o-mini-2024-07-18';

UPDATE models SET description = 'GPT-4o with ChatGPT web search provides real-time information access. Combines GPT-4o''s multimodal abilities with grounded, current responses.' WHERE id = 'openai-gpt-4o-search-grounded';

UPDATE models SET description = 'GPT-4o Mini with web search offers cost-effective real-time information access. Ideal for chatbots needing current data at scale.' WHERE id = 'openai-gpt-4o-mini-search-grounded';

UPDATE models SET description = 'GPT-5 represents a major leap in AI capabilities with breakthrough reasoning, coding, and creative abilities. Features enhanced safety and longer context understanding.' WHERE id = 'openai-gpt-5';

UPDATE models SET description = 'GPT-5 Chat Latest automatically points to the current GPT-5 release. Best for applications requiring top performance with automatic updates.' WHERE id = 'openai-gpt-5-chat-latest';

UPDATE models SET description = 'GPT-5 Mini delivers GPT-5 intelligence at reduced cost. Excellent balance of capability and efficiency for production workloads.' WHERE id = 'openai-gpt-5-mini';

UPDATE models SET description = 'GPT-5 Mini 2025.08.07 is a versioned release for production stability with GPT-5 Mini capabilities.' WHERE id = 'openai-gpt-5-mini-2025-08-07';

UPDATE models SET description = 'GPT-5 Nano is the most cost-efficient GPT-5 variant. Optimized for high-volume, simple tasks while maintaining quality improvements.' WHERE id = 'openai-gpt-5-nano';

UPDATE models SET description = 'GPT-5 Nano 2025.08.07 is a versioned Nano release offering consistent performance for cost-sensitive applications.' WHERE id = 'openai-gpt-5-nano-2025-08-07';

UPDATE models SET description = 'GPT-5 Pro is the highest-capability GPT-5 variant. Excels at expert-level reasoning, research, and complex multi-step problem solving.' WHERE id = 'openai-gpt-5-pro';

UPDATE models SET description = 'GPT-5 Pro 2025.10.06 is a versioned release of GPT-5 Pro for production applications requiring maximum capability.' WHERE id = 'openai-gpt-5-pro-2025-10-06';

UPDATE models SET description = 'GPT-5 2025.08.07 is a versioned release of the base GPT-5 model for applications requiring reproducibility.' WHERE id = 'openai-gpt-5-2025-08-07';

UPDATE models SET description = 'GPT-5.1 introduces significant improvements in reasoning, instruction following, and reduced hallucinations. Enhanced tool use and structured outputs.' WHERE id = 'openai-gpt-5-1';

UPDATE models SET description = 'GPT-5.1 Chat Latest points to the current GPT-5.1 release. Recommended for applications wanting automatic access to improvements.' WHERE id = 'openai-gpt-5-1-chat-latest';

UPDATE models SET description = 'GPT-5.1 2025.11.13 is a versioned release for production stability with GPT-5.1''s enhanced capabilities.' WHERE id = 'openai-gpt-5-1-2025-11-13';

UPDATE models SET description = 'GPT-5.2 is OpenAI''s latest flagship model with state-of-the-art reasoning, coding, and multimodal capabilities. Features improved safety and efficiency.' WHERE id = 'openai-gpt-5-2';

UPDATE models SET description = 'GPT-5.2 Chat Latest automatically tracks the current GPT-5.2 release. Best for cutting-edge applications.' WHERE id = 'openai-gpt-5-2-chat-latest';

UPDATE models SET description = 'GPT-5.2 Pro delivers maximum GPT-5.2 capability for expert-level tasks. Ideal for research, complex analysis, and advanced coding.' WHERE id = 'openai-gpt-5-2-pro';

UPDATE models SET description = 'GPT-5.2 Pro 2025.12.11 is a versioned release of GPT-5.2 Pro for production use.' WHERE id = 'openai-gpt-5-2-pro-2025-12-11';

UPDATE models SET description = 'GPT-5.2 2025.12.11 is a versioned release offering consistent GPT-5.2 behavior for applications requiring reproducibility.' WHERE id = 'openai-gpt-5-2-2025-12-11';

-- OpenAI O-series Reasoning Models
UPDATE models SET description = 'O1 is OpenAI''s reasoning model that thinks step-by-step before responding. Excels at math, coding, and scientific reasoning with transparent chain-of-thought.' WHERE id = 'openai-o1';

UPDATE models SET description = 'O1 Pro is the highest-capability reasoning model with extended thinking time. Designed for research-level mathematics, science, and complex coding challenges.' WHERE id = 'openai-o1-pro';

UPDATE models SET description = 'O1 Pro 2025.03.19 is a versioned release of O1 Pro for applications requiring stable advanced reasoning.' WHERE id = 'openai-o1-pro-2025-03-19';

UPDATE models SET description = 'O1 2024.12.17 is a versioned release of the O1 reasoning model for production stability.' WHERE id = 'openai-o1-2024-12-17';

UPDATE models SET description = 'O3 is OpenAI''s next-generation reasoning model with breakthrough performance on ARC-AGI and competition math. Features multimodal reasoning and tool use.' WHERE id = 'openai-o3';

UPDATE models SET description = 'O3 Mini balances O3 reasoning capabilities with faster responses and lower cost. Ideal for applications needing strong reasoning at scale.' WHERE id = 'openai-o3-mini';

UPDATE models SET description = 'O3 Mini 2025.01.31 is a versioned release for production applications requiring O3-class reasoning efficiently.' WHERE id = 'openai-o3-mini-2025-01-31';

UPDATE models SET description = 'O3 2025.04.16 is a versioned release of the O3 reasoning model for applications requiring reproducibility.' WHERE id = 'openai-o3-2025-04-16';

UPDATE models SET description = 'O4 Mini is the latest efficient reasoning model with improved speed and cost-effectiveness while maintaining strong logical capabilities.' WHERE id = 'openai-o4-mini';

UPDATE models SET description = 'O4 Mini 2025.04.16 is a versioned release for production use of O4 Mini reasoning capabilities.' WHERE id = 'openai-o4-mini-2025-04-16';

-- xAI Grok Models
UPDATE models SET description = 'Grok 2 Vision 1212 combines Grok 2 with advanced image understanding. Can analyze images, charts, and documents with natural language interaction.' WHERE id = 'xai-grok-2-vision-1212';

UPDATE models SET description = 'Grok 2 Image 1212 enables Grok to generate images from text descriptions. Creates visual content based on natural language prompts.' WHERE id = 'xai-grok-2-image-1212';

UPDATE models SET description = 'Grok 2 (1212) is xAI''s capable general model with strong reasoning and real-time X/Twitter data access. Features humor and direct communication style.' WHERE id = 'xai-grok-2-1212';

UPDATE models SET description = 'Grok 3 is xAI''s flagship model with significantly improved reasoning, coding, and factual knowledge. Trained on curated web data and X platform content.' WHERE id = 'xai-grok-3';

UPDATE models SET description = 'Grok 3 Mini offers Grok 3 capabilities at reduced cost with faster responses. Ideal for chatbots and applications needing quick, capable responses.' WHERE id = 'xai-grok-3-mini';

UPDATE models SET description = 'Grok 4 Fast (Non-Reasoning) delivers rapid responses without explicit chain-of-thought. Optimized for conversational tasks requiring quick turnaround.' WHERE id = 'xai-grok-4-fast-non-reasoning';

UPDATE models SET description = 'Grok 4 Fast Reasoning combines speed with step-by-step reasoning capabilities. Balances thinking depth with response time.' WHERE id = 'xai-grok-4-fast-reasoning';

UPDATE models SET description = 'Grok 4 (0709) is a versioned release of Grok 4 for production applications requiring consistent behavior.' WHERE id = 'xai-grok-4-0709';

UPDATE models SET description = 'Grok 4 (0709) with web search for real-time information. Combines Grok 4''s capabilities with grounded, current responses.' WHERE id = 'xai-grok-4-0709-grounded';

UPDATE models SET description = 'Grok 4.1 Fast (Non-Reasoning) offers improved quick response capabilities without explicit reasoning chains. Enhanced for conversational fluency.' WHERE id = 'xai-grok-4-1-fast-non-reasoning';

UPDATE models SET description = 'Grok 4.1 Fast Reasoning balances Grok 4.1''s improved reasoning with fast response times. Suitable for real-time analytical applications.' WHERE id = 'xai-grok-4-1-fast-reasoning';

UPDATE models SET description = 'Grok Code Fast 1 is optimized for coding tasks with rapid responses. Excels at code completion, debugging, and technical explanations.' WHERE id = 'xai-grok-code-fast-1';

-- Additional local/seed model IDs with simplified naming
UPDATE models SET description = 'Claude Sonnet 4.5 offers near-Opus performance with faster response times. Excels at coding, data analysis, and document processing with excellent price-performance ratio.' WHERE id = 'anthropic-claude-sonnet';

UPDATE models SET description = 'GPT-5.2 is OpenAI''s latest flagship model with state-of-the-art reasoning, coding, and multimodal capabilities. Features improved safety and efficiency.' WHERE id = 'openai-gpt52';
