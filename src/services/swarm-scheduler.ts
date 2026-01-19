/**
 * Swarm scheduler service
 * Runs scheduled swarms based on their cron expressions
 *
 * IDEMPOTENCY: Cloudflare may invoke cron triggers from multiple data centers
 * simultaneously. We deduplicate by checking last_run_at before execution and
 * updating it atomically before starting work.
 */

import type { Env } from '../types/env';
import {
  getSwarm,
  getSwarms,
  getSwarmVersionModels,
  updateSwarmLastRunAt,
  createSwarmRun,
  type SwarmWithDetails,
} from './swarms';
import { getModel } from './storage';
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
 * Supports: *, specific numbers, comma-separated lists, ranges, steps
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
 * Convert schedule_type to cron expression if not custom
 */
function getEffectiveCron(swarm: SwarmWithDetails): string | null {
  if (!swarm.schedule_type) return null;
  if (swarm.cron_expression) return swarm.cron_expression;

  // Default schedules run at 9:00 AM UTC
  switch (swarm.schedule_type) {
    case 'daily':
      return '0 9 * * *';
    case 'weekly':
      return '0 9 * * 1'; // Monday at 9 AM
    case 'monthly':
      return '0 9 1 * *'; // 1st of month at 9 AM
    default:
      return null;
  }
}

/**
 * Check if a swarm already ran in the current minute (for idempotency)
 * Returns true if the swarm should be skipped because it already ran
 */
function alreadyRanInCurrentMinute(
  lastRunAt: string | null,
  scheduledTime: Date
): boolean {
  if (!lastRunAt) return false;

  const lastRun = new Date(lastRunAt);
  // Compare year, month, day, hour, minute (ignore seconds/milliseconds)
  return (
    lastRun.getUTCFullYear() === scheduledTime.getUTCFullYear() &&
    lastRun.getUTCMonth() === scheduledTime.getUTCMonth() &&
    lastRun.getUTCDate() === scheduledTime.getUTCDate() &&
    lastRun.getUTCHours() === scheduledTime.getUTCHours() &&
    lastRun.getUTCMinutes() === scheduledTime.getUTCMinutes()
  );
}

/**
 * Run all scheduled swarms that are due
 * @param env - Environment bindings
 * @param scheduledTime - The time the cron trigger fired (not the execution time)
 */
export async function runScheduledSwarms(
  env: Env,
  scheduledTime: Date
): Promise<{
  checked: number;
  ran: number;
  results: Array<{
    swarmId: string;
    success: boolean;
    modelsRan: number;
    error?: string;
  }>;
}> {
  const swarms = await getSwarms(env.DB);

  const results: Array<{
    swarmId: string;
    success: boolean;
    modelsRan: number;
    error?: string;
  }> = [];

  let ran = 0;

  for (const swarm of swarms) {
    // Skip if no schedule or paused
    if (!swarm.schedule_type || swarm.is_paused) {
      continue;
    }

    const cronExpression = getEffectiveCron(swarm);
    if (!cronExpression) {
      continue;
    }

    // Check if cron matches the scheduled trigger time (not current execution time)
    if (!cronMatchesNow(cronExpression, scheduledTime)) {
      continue;
    }

    // IDEMPOTENCY CHECK: Skip if swarm already ran in the current minute
    // This handles Cloudflare invoking cron from multiple data centers
    if (alreadyRanInCurrentMinute(swarm.last_run_at, scheduledTime)) {
      console.log(
        `Skipping swarm ${swarm.id}: already ran at ${swarm.last_run_at} (scheduled for ${scheduledTime.toISOString()})`
      );
      continue;
    }

    // Update last_run_at BEFORE execution to prevent races from concurrent triggers
    // Use scheduledTime (not current time) so all triggers in the same minute see the same value
    await updateSwarmLastRunAt(env.DB, swarm.id, scheduledTime);

    // Re-fetch swarm to check if another worker beat us (double-check after update)
    const freshSwarm = await getSwarm(env.DB, swarm.id);
    if (
      freshSwarm &&
      freshSwarm.last_run_at &&
      new Date(freshSwarm.last_run_at).getTime() !== scheduledTime.getTime()
    ) {
      // Another worker updated last_run_at to a different time - they won the race
      console.log(
        `Skipping swarm ${swarm.id}: lost race to another worker (last_run_at=${freshSwarm.last_run_at})`
      );
      continue;
    }

    // Run this swarm
    try {
      const result = await runSwarm(env, swarm);
      results.push({
        swarmId: swarm.id,
        success: true,
        modelsRan: result.modelsRan,
      });
      ran++;
      console.log(`Scheduled swarm ${swarm.id} ran successfully with ${result.modelsRan} models`);
    } catch (err) {
      results.push({
        swarmId: swarm.id,
        success: false,
        modelsRan: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`Scheduled swarm ${swarm.id} failed:`, err);
    }
  }

  return {
    checked: swarms.length,
    ran,
    results,
  };
}

/**
 * Run a single swarm
 */
async function runSwarm(
  env: Env,
  swarm: SwarmWithDetails
): Promise<{ modelsRan: number }> {
  const modelIds = await getSwarmVersionModels(env.DB, swarm.id);
  if (modelIds.length === 0) {
    throw new Error('Swarm has no models configured');
  }

  const promptId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();
  const runResults: Array<{
    modelId: string;
    response?: string;
    error?: string;
    latencyMs: number;
    success: boolean;
  }> = [];

  for (const modelId of modelIds) {
    const model = await getModel(env.DB, modelId);
    if (!model) {
      console.error(`Model not found: ${modelId}`);
      runResults.push({
        modelId,
        error: 'Model not found',
        latencyMs: 0,
        success: false,
      });
      continue;
    }

    let responseContent: string | null = null;
    let reasoningContent: string | null = null;
    let errorMsg: string | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const grounded = model.grounded === 1;
      const provider = createLLMProvider(model.id, model.provider, model.model_name, env, grounded);
      const start = Date.now();
      const response = await provider.complete({ prompt: swarm.prompt_text });
      latencyMs = Date.now() - start;
      responseContent = response.content;
      reasoningContent = response.reasoningContent ?? null;
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    }

    // Calculate costs
    let inputCost: number | null = null;
    let outputCost: number | null = null;
    if (model.input_price_per_m !== null && inputTokens > 0) {
      inputCost = (inputTokens / 1_000_000) * model.input_price_per_m;
    }
    if (model.output_price_per_m !== null && outputTokens > 0) {
      outputCost = (outputTokens / 1_000_000) * model.output_price_per_m;
    }

    // Save to BigQuery
    const bqRow: BigQueryRow = {
      id: crypto.randomUUID(),
      prompt_id: promptId,
      collected_at: collectedAt,
      source: 'swarm',
      company: extractCompany(model.provider, model.model_name),
      product: extractProductFamily(model.model_name),
      model: model.model_name,
      topic_id: null,
      topic_name: null,
      prompt_template_id: null,
      prompt_template_name: null,
      prompt: swarm.prompt_text,
      response: responseContent,
      reasoning_content: reasoningContent,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      error: errorMsg,
      success: !errorMsg,
      swarm_id: swarm.id,
      swarm_version: swarm.current_version,
    };

    const bqResult = await insertRow(env, bqRow);
    if (!bqResult.success) {
      console.error('Failed to save swarm response to BigQuery:', bqResult.error);
    }

    runResults.push({
      modelId,
      response: responseContent ?? undefined,
      error: errorMsg ?? undefined,
      latencyMs,
      success: !errorMsg,
    });
  }

  // Store results in D1 for immediate access
  await createSwarmRun(env.DB, swarm.id, swarm.current_version, runResults);

  // NOTE: last_run_at is now updated BEFORE execution in runScheduledSwarms()
  // to prevent duplicate runs from concurrent cron triggers

  return { modelsRan: runResults.length };
}
