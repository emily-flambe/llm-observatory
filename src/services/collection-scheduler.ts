/**
 * Collection scheduler service
 * Runs scheduled collections based on their cron expressions
 */

import type { Env } from '../types/env';
import {
  getCollections,
  getCollectionVersionModels,
  updateCollectionLastRunAt,
  getModel,
  type CollectionWithDetails,
} from './storage';
import { createLLMProvider } from './llm';
import {
  insertRow,
  extractProductFamily,
  extractCompany,
  type BigQueryRow,
} from './bigquery';

/**
 * Check if a cron expression matches the current UTC time
 * Supports standard 5-field cron: minute hour day month weekday
 */
function cronMatchesNow(cronExpression: string, now: Date): boolean {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const nowMinute = now.getUTCMinutes();
  const nowHour = now.getUTCHours();
  const nowDayOfMonth = now.getUTCDate();
  const nowMonth = now.getUTCMonth() + 1; // 1-12
  const nowDayOfWeek = now.getUTCDay(); // 0-6 (Sunday = 0)

  return (
    matchCronField(minute, nowMinute) &&
    matchCronField(hour, nowHour) &&
    matchCronField(dayOfMonth, nowDayOfMonth) &&
    matchCronField(month, nowMonth) &&
    matchCronField(dayOfWeek, nowDayOfWeek)
  );
}

/**
 * Check if a cron field matches a value
 * Supports: *, specific numbers, comma-separated lists
 */
function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true;

  // Handle comma-separated values
  const values = field.split(',');
  for (const v of values) {
    if (v.includes('/')) {
      // Handle step values like */5
      const [range, step] = v.split('/');
      const stepNum = parseInt(step, 10);
      if (range === '*' && value % stepNum === 0) return true;
    } else if (v.includes('-')) {
      // Handle ranges like 1-5
      const [start, end] = v.split('-').map((n) => parseInt(n, 10));
      if (value >= start && value <= end) return true;
    } else {
      // Exact match
      if (parseInt(v, 10) === value) return true;
    }
  }

  return false;
}

/**
 * Run all scheduled collections that are due
 */
export async function runScheduledCollections(env: Env): Promise<{
  checked: number;
  ran: number;
  results: Array<{
    collectionId: string;
    success: boolean;
    modelsRan: number;
    error?: string;
  }>;
}> {
  const now = new Date();
  const collections = await getCollections(env.DB);

  const results: Array<{
    collectionId: string;
    success: boolean;
    modelsRan: number;
    error?: string;
  }> = [];

  let ran = 0;

  for (const collection of collections) {
    // Skip if no schedule or paused
    if (!collection.schedule_type || collection.is_paused || !collection.cron_expression) {
      continue;
    }

    // Check if cron matches current time
    if (!cronMatchesNow(collection.cron_expression, now)) {
      continue;
    }

    // Run this collection
    try {
      const result = await runCollection(env, collection);
      results.push({
        collectionId: collection.id,
        success: true,
        modelsRan: result.modelsRan,
      });
      ran++;
    } catch (err) {
      results.push({
        collectionId: collection.id,
        success: false,
        modelsRan: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    checked: collections.length,
    ran,
    results,
  };
}

/**
 * Run a single collection
 */
async function runCollection(
  env: Env,
  collection: CollectionWithDetails
): Promise<{ modelsRan: number }> {
  const modelIds = await getCollectionVersionModels(env.DB, collection.id);
  if (modelIds.length === 0) {
    throw new Error('Collection has no models configured');
  }

  const promptId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();
  let modelsRan = 0;

  for (const modelId of modelIds) {
    const model = await getModel(env.DB, modelId);
    if (!model) {
      console.error(`Model not found: ${modelId}`);
      continue;
    }

    let responseContent: string | null = null;
    let errorMsg: string | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const provider = createLLMProvider(model.id, model.provider, model.model_name, env);
      const start = Date.now();
      const response = await provider.complete({ prompt: collection.prompt_text });
      latencyMs = Date.now() - start;
      responseContent = response.content;
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    }

    // Save to BigQuery with collection reference
    const bqRow: BigQueryRow = {
      id: crypto.randomUUID(),
      prompt_id: promptId,
      collected_at: collectedAt,
      source: 'collection',
      company: extractCompany(model.provider, model.model_name),
      product: extractProductFamily(model.model_name),
      model: model.model_name,
      topic_id: collection.topic_id,
      topic_name: collection.topic_name,
      prompt_template_id: collection.template_id,
      prompt_template_name: collection.template_name,
      prompt: collection.prompt_text,
      response: responseContent,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error: errorMsg,
      success: !errorMsg,
      collection_id: collection.id,
      collection_version: collection.current_version,
    };

    await insertRow(env, bqRow).catch((err) => {
      console.error('Failed to save collection response to BigQuery:', err);
    });

    modelsRan++;
  }

  // Update last_run_at
  await updateCollectionLastRunAt(env.DB, collection.id);

  return { modelsRan };
}
