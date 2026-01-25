/**
 * Swarm scheduler service
 * Runs scheduled swarms based on their cron expressions
 *
 * IDEMPOTENCY: Cloudflare may invoke cron triggers from multiple data centers
 * simultaneously. We deduplicate using a DUAL CLAIM approach:
 *
 * 1. Quick check: Skip if last_run_at already falls within the current minute
 * 2. INSERT claim: Insert into scheduled_run_claims with UNIQUE(swarm_id, scheduled_for)
 * 3. CAS claim: UPDATE last_run_at with compare-and-swap pattern
 *
 * Both claims must succeed. This provides:
 * - UNIQUE constraint: Robust against D1 eventual consistency across regions
 * - CAS claim: Backward compatibility with old code versions during deployment
 *
 * During deployments, both old and new code versions may run. Old versions only
 * use CAS, new versions use both. By requiring both to succeed, we ensure only
 * one worker (regardless of version) can execute the swarm.
 */

import type { Env } from '../types/env';
import {
  getSwarms,
  getSwarmVersionModels,
  claimScheduledRun,
  claimSwarmExecution,
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
 * Exported for testing.
 */
export function alreadyRanInCurrentMinute(
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
    // This is a fast path to avoid unnecessary claim attempts
    if (alreadyRanInCurrentMinute(swarm.last_run_at, scheduledTime)) {
      console.log(
        `Skipping swarm ${swarm.id}: already ran at ${swarm.last_run_at} (scheduled for ${scheduledTime.toISOString()})`
      );
      continue;
    }

    // DUAL CLAIM MECHANISM: Use both approaches for backward compatibility
    // 1. UNIQUE constraint claim (robust against D1 eventual consistency)
    // 2. Compare-and-swap claim (backward compat with old code versions)
    // Both must succeed to proceed - this ensures coordination between
    // different code versions that might be running during deployments

    // Try INSERT-based claim first (UNIQUE constraint)
    const claimedViaInsert = await claimScheduledRun(env.DB, swarm.id, scheduledTime);
    if (!claimedViaInsert) {
      console.log(
        `Skipping swarm ${swarm.id}: lost race to another worker (UNIQUE constraint)`
      );
      continue;
    }

    // Also try compare-and-swap claim to update last_run_at
    // This blocks old code versions that only check last_run_at
    const claimedViaCAS = await claimSwarmExecution(env.DB, swarm.id, scheduledTime);
    if (!claimedViaCAS) {
      // INSERT succeeded but CAS failed - another (old) worker already claimed
      console.log(
        `Skipping swarm ${swarm.id}: INSERT succeeded but CAS failed (old code version won)`
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
