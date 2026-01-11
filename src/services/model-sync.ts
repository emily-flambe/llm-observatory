// Model sync service - fetches models from provider APIs and syncs to D1

import type { Env } from '../types/env';
import { upsertAutoModel, logModelSync } from './storage';

export interface ModelSyncResult {
  provider: string;
  modelsFound: number;
  modelsAdded: number;
  error?: string;
}

// OpenAI API response types
interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface OpenAIModelsResponse {
  data: OpenAIModel[];
}

// Anthropic API response types
interface AnthropicModel {
  id: string;
  display_name: string;
  type: string;
  created_at: string;
}

interface AnthropicModelsResponse {
  data: AnthropicModel[];
  has_more: boolean;
}

// Google API response types
interface GoogleModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

interface GoogleModelsResponse {
  models: GoogleModel[];
}

// xAI API response types (OpenAI-compatible)
interface XAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface XAIModelsResponse {
  data: XAIModel[];
}

// DeepSeek API response types (OpenAI-compatible)
interface DeepSeekModel {
  id: string;
  object: string;
  owned_by: string;
}

interface DeepSeekModelsResponse {
  data: DeepSeekModel[];
}

// Generate stable model ID from provider and model name
function generateModelId(provider: string, modelName: string): string {
  // Sanitize model name for ID: lowercase, replace special chars
  const sanitized = modelName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${provider}-${sanitized}`;
}

// Generate display name from model ID
function generateDisplayName(modelId: string): string {
  // Convert model ID to human-readable format
  // e.g., "gpt-4o" -> "GPT-4o", "claude-3-5-sonnet-20241022" -> "Claude 3.5 Sonnet"
  return modelId
    .split('-')
    .map((part, i) => {
      // Capitalize first part or known acronyms
      if (i === 0 || ['gpt', 'o1', 'o3'].includes(part.toLowerCase())) {
        return part.toUpperCase();
      }
      // Capitalize first letter of other parts
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/(\d+) (\d+)/g, '$1.$2'); // "3 5" -> "3.5"
}

// Filter for OpenAI chat models
function isOpenAIChatModel(model: OpenAIModel): boolean {
  const id = model.id.toLowerCase();

  // Include GPT and reasoning models
  if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    // Exclude fine-tunes
    if (id.includes(':ft-')) return false;
    // Exclude audio/realtime variants
    if (id.includes('-audio') || id.includes('-realtime')) return false;
    return true;
  }

  return false;
}

// Filter for Google chat models
function isGoogleChatModel(model: GoogleModel): boolean {
  // Must support generateContent for chat
  if (!model.supportedGenerationMethods?.includes('generateContent')) {
    return false;
  }

  // Only include Gemini models (exclude deprecated PaLM, etc.)
  const name = model.name.toLowerCase();
  if (!name.includes('gemini')) {
    return false;
  }

  return true;
}

// Filter for xAI chat models
function isXAIChatModel(model: XAIModel): boolean {
  const id = model.id.toLowerCase();
  return id.includes('grok');
}

// Filter for DeepSeek chat models
function isDeepSeekChatModel(model: DeepSeekModel): boolean {
  const id = model.id.toLowerCase();
  // Include chat and reasoner models
  return id.includes('deepseek-chat') || id.includes('deepseek-reasoner');
}

// Convert Unix timestamp to ISO string
function unixToIso(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

// Sync OpenAI models
async function syncOpenAIModels(env: Env): Promise<ModelSyncResult> {
  const provider = 'openai';

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenAIModelsResponse;
    const chatModels = data.data.filter(isOpenAIChatModel);

    let modelsAdded = 0;
    for (const model of chatModels) {
      const result = await upsertAutoModel(env.DB, {
        id: generateModelId(provider, model.id),
        provider,
        model_name: model.id,
        display_name: generateDisplayName(model.id),
        model_type: 'chat',
        released_at: model.created ? unixToIso(model.created) : null,
      });
      if (result.action === 'inserted') modelsAdded++;
    }

    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: chatModels.length,
      models_added: modelsAdded,
    });

    return { provider, modelsFound: chatModels.length, modelsAdded };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: 0,
      models_added: 0,
      error: errorMsg,
    });
    return { provider, modelsFound: 0, modelsAdded: 0, error: errorMsg };
  }
}

// Sync Anthropic models
async function syncAnthropicModels(env: Env): Promise<ModelSyncResult> {
  const provider = 'anthropic';

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as AnthropicModelsResponse;
    // Anthropic API returns only chat models, no filtering needed

    let modelsAdded = 0;
    for (const model of data.data) {
      const result = await upsertAutoModel(env.DB, {
        id: generateModelId(provider, model.id),
        provider,
        model_name: model.id,
        display_name: model.display_name || generateDisplayName(model.id),
        model_type: 'chat',
        released_at: model.created_at || null,
      });
      if (result.action === 'inserted') modelsAdded++;
    }

    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: data.data.length,
      models_added: modelsAdded,
    });

    return { provider, modelsFound: data.data.length, modelsAdded };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: 0,
      models_added: 0,
      error: errorMsg,
    });
    return { provider, modelsFound: 0, modelsAdded: 0, error: errorMsg };
  }
}

// Sync Google models
async function syncGoogleModels(env: Env): Promise<ModelSyncResult> {
  const provider = 'google';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GOOGLE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = (await response.json()) as GoogleModelsResponse;
    const chatModels = data.models.filter(isGoogleChatModel);

    let modelsAdded = 0;
    for (const model of chatModels) {
      // Google model names are like "models/gemini-1.5-pro", extract just the model part
      const modelName = model.name.replace('models/', '');
      const result = await upsertAutoModel(env.DB, {
        id: generateModelId(provider, modelName),
        provider,
        model_name: modelName,
        display_name: model.displayName || generateDisplayName(modelName),
        model_type: 'chat',
      });
      if (result.action === 'inserted') modelsAdded++;
    }

    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: chatModels.length,
      models_added: modelsAdded,
    });

    return { provider, modelsFound: chatModels.length, modelsAdded };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: 0,
      models_added: 0,
      error: errorMsg,
    });
    return { provider, modelsFound: 0, modelsAdded: 0, error: errorMsg };
  }
}

// Sync xAI models
async function syncXAIModels(env: Env): Promise<ModelSyncResult> {
  const provider = 'xai';

  try {
    const response = await fetch('https://api.x.ai/v1/models', {
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status}`);
    }

    const data = (await response.json()) as XAIModelsResponse;
    const chatModels = data.data.filter(isXAIChatModel);

    let modelsAdded = 0;
    for (const model of chatModels) {
      const result = await upsertAutoModel(env.DB, {
        id: generateModelId(provider, model.id),
        provider,
        model_name: model.id,
        display_name: generateDisplayName(model.id),
        model_type: 'chat',
        released_at: model.created ? unixToIso(model.created) : null,
      });
      if (result.action === 'inserted') modelsAdded++;
    }

    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: chatModels.length,
      models_added: modelsAdded,
    });

    return { provider, modelsFound: chatModels.length, modelsAdded };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: 0,
      models_added: 0,
      error: errorMsg,
    });
    return { provider, modelsFound: 0, modelsAdded: 0, error: errorMsg };
  }
}

// Sync DeepSeek models
async function syncDeepSeekModels(env: Env): Promise<ModelSyncResult> {
  const provider = 'deepseek';

  try {
    const response = await fetch('https://api.deepseek.com/models', {
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = (await response.json()) as DeepSeekModelsResponse;
    const chatModels = data.data.filter(isDeepSeekChatModel);

    let modelsAdded = 0;
    for (const model of chatModels) {
      // Generate display name: deepseek-reasoner -> DeepSeek R1, deepseek-chat -> DeepSeek Chat
      const displayName =
        model.id === 'deepseek-reasoner' ? 'DeepSeek R1' : generateDisplayName(model.id);
      const result = await upsertAutoModel(env.DB, {
        id: generateModelId(provider, model.id),
        provider,
        model_name: model.id,
        display_name: displayName,
        model_type: 'chat',
      });
      if (result.action === 'inserted') modelsAdded++;
    }

    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: chatModels.length,
      models_added: modelsAdded,
    });

    return { provider, modelsFound: chatModels.length, modelsAdded };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider,
      models_found: 0,
      models_added: 0,
      error: errorMsg,
    });
    return { provider, modelsFound: 0, modelsAdded: 0, error: errorMsg };
  }
}

// Sync all providers
export async function syncAllProviders(env: Env): Promise<ModelSyncResult[]> {
  const results = await Promise.allSettled([
    syncOpenAIModels(env),
    syncAnthropicModels(env),
    syncGoogleModels(env),
    syncXAIModels(env),
    syncDeepSeekModels(env),
  ]);

  return results.map((result, index) => {
    const providers = ['openai', 'anthropic', 'google', 'xai', 'deepseek'];
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      provider: providers[index],
      modelsFound: 0,
      modelsAdded: 0,
      error: result.reason?.message || 'Unknown error',
    };
  });
}
