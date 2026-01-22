import type { Env } from '../../types/env';
import type { LLMProvider } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { CloudflareProvider } from './cloudflare';
import { XAIProvider } from './xai';
import { DeepSeekProvider } from './deepseek';
import { PerplexityProvider } from './perplexity';

export function createLLMProvider(
  modelId: string,
  provider: string,
  modelName: string,
  env: Env,
  grounded: boolean = false
): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(modelId, modelName, env.OPENAI_API_KEY, grounded);
    case 'anthropic':
      return new AnthropicProvider(modelId, modelName, env.ANTHROPIC_API_KEY, grounded);
    case 'google':
      return new GoogleProvider(modelId, modelName, env.GOOGLE_API_KEY, grounded);
    case 'cloudflare':
      return new CloudflareProvider(modelId, modelName, env.AI);
    case 'xai':
      return new XAIProvider(modelId, modelName, env.XAI_API_KEY, grounded);
    case 'deepseek':
      return new DeepSeekProvider(modelId, modelName, env.DEEPSEEK_API_KEY);
    case 'perplexity':
      return new PerplexityProvider(modelId, modelName, env.PERPLEXITY_API_KEY, grounded);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export * from './types';
