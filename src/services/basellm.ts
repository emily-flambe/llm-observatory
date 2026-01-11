// Basellm metadata service - fetches model metadata from basellm/llm-metadata
// Source: https://github.com/basellm/llm-metadata

import type { Env } from '../types/env';
import { updateModelMetadata, logModelSync } from './storage';

const BASELLM_API_URL =
  'https://raw.githubusercontent.com/basellm/llm-metadata/main/dist/api/all.json';

// Basellm model structure
interface BasellmModel {
  id: string;
  name: string;
  family?: string;
  description?: string;
  release_date?: string;
  knowledge?: string; // Training cutoff (e.g., "2024-04")
  last_updated?: string;
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
  };
  limit?: {
    context?: number;
    output?: number;
  };
  modalities?: {
    input?: string[];
    output?: string[];
  };
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  open_weights?: boolean;
}

// Basellm API response structure (keyed by provider)
interface BasellmResponse {
  [providerId: string]: {
    models: Record<string, BasellmModel>;
  };
}

// Map our provider names to basellm provider IDs
const PROVIDER_MAP: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  xai: 'xai',
};

export interface MetadataSyncResult {
  modelsProcessed: number;
  modelsUpdated: number;
  error?: string;
}

// Fetch basellm metadata and enrich our models
export async function syncBasellmMetadata(env: Env): Promise<MetadataSyncResult> {
  try {
    const response = await fetch(BASELLM_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch basellm data: ${response.status}`);
    }

    const data = (await response.json()) as BasellmResponse;

    let modelsProcessed = 0;
    let modelsUpdated = 0;

    // Process each provider we care about
    for (const basellmProvider of Object.values(PROVIDER_MAP)) {
      const providerData = data[basellmProvider];
      if (!providerData?.models) continue;

      for (const model of Object.values(providerData.models)) {
        modelsProcessed++;

        // Convert basellm date format to ISO
        const releasedAt = model.release_date ? normalizeDate(model.release_date) : null;
        const knowledgeCutoff = model.knowledge || null;

        const result = await updateModelMetadata(env.DB, model.id, {
          released_at: releasedAt,
          knowledge_cutoff: knowledgeCutoff,
        });

        if (result.updated) {
          modelsUpdated++;
        }
      }
    }

    // Log the sync
    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider: 'basellm',
      models_found: modelsProcessed,
      models_added: modelsUpdated,
    });

    return { modelsProcessed, modelsUpdated };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    await logModelSync(env.DB, {
      id: crypto.randomUUID(),
      provider: 'basellm',
      models_found: 0,
      models_added: 0,
      error: errorMsg,
    });

    return { modelsProcessed: 0, modelsUpdated: 0, error: errorMsg };
  }
}

// Normalize date formats from basellm to ISO
// basellm uses formats like "2024-05-13" or "2024-04"
function normalizeDate(date: string): string {
  // If it's already a full date (YYYY-MM-DD), return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  // If it's a month (YYYY-MM), return first of month
  if (/^\d{4}-\d{2}$/.test(date)) {
    return `${date}-01`;
  }
  // Otherwise return as-is
  return date;
}
