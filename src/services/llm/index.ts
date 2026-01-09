import type { Env } from '../../types/env';
import type { LLMProvider } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { CloudflareProvider } from './cloudflare';

export function createLLMProvider(
  modelId: string,
  provider: string,
  modelName: string,
  env: Env
): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(modelId, modelName, env.OPENAI_API_KEY);
    case 'anthropic':
      return new AnthropicProvider(modelId, modelName, env.ANTHROPIC_API_KEY);
    case 'google':
      return new GoogleProvider(modelId, modelName, env.GOOGLE_API_KEY);
    case 'cloudflare':
      return new CloudflareProvider(modelId, modelName, env.AI);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export * from './types';
