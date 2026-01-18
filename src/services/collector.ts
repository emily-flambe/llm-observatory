import type { Env } from '../types/env';
import { getModel, getPromptTemplate } from './storage';
import { insertRow, extractProductFamily, extractCompany, type BigQueryRow } from './bigquery';
import { createLLMProvider } from './llm';

export interface CollectionResult {
  success: boolean;
  responseId: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Generate a slug from a topic name
 */
function generateTopicId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Render a prompt template by replacing {topic} with the topic name
 */
function renderPrompt(template: string, topicName: string): string {
  return template.replace(/\{topic\}/gi, topicName);
}

export async function collectForTopic(
  topicIdOrName: string,
  modelId: string,
  promptTemplateId: string,
  env: Env,
  topicName?: string, // Optional: if provided, topicIdOrName is treated as ID
  promptId?: string // Optional: groups responses from same prompt submission
): Promise<CollectionResult> {
  const responseId = crypto.randomUUID();
  const finalPromptId = promptId ?? crypto.randomUUID();
  const collectedAt = new Date().toISOString();

  // Determine topic ID and name
  // If topicName is provided, use topicIdOrName as ID
  // Otherwise, topicIdOrName could be either - we'll use it as name and generate ID
  let finalTopicId: string;
  let finalTopicName: string;

  if (topicName) {
    finalTopicId = topicIdOrName;
    finalTopicName = topicName;
  } else {
    // Treat as name, generate ID from it
    finalTopicName = topicIdOrName;
    finalTopicId = generateTopicId(topicIdOrName);
  }

  const model = await getModel(env.DB, modelId);
  if (!model) {
    return { success: false, responseId, error: `Model not found: ${modelId}` };
  }

  const promptTemplate = await getPromptTemplate(env.DB, promptTemplateId);
  if (!promptTemplate) {
    return { success: false, responseId, error: `Prompt template not found: ${promptTemplateId}` };
  }

  const prompt = renderPrompt(promptTemplate.template, finalTopicName);

  const startTime = Date.now();
  let rawResponse = '';
  let reasoningContent: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let error: string | null = null;

  try {
    const grounded = model.grounded === 1;
    const provider = createLLMProvider(model.id, model.provider, model.model_name, env, grounded);
    const result = await provider.complete({ prompt });
    rawResponse = result.content;
    reasoningContent = result.reasoningContent ?? null;
    inputTokens = result.inputTokens ?? null;
    outputTokens = result.outputTokens ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const latencyMs = Date.now() - startTime;

  // Calculate costs based on model pricing
  const finalInputTokens = inputTokens ?? 0;
  const finalOutputTokens = outputTokens ?? 0;
  let inputCost: number | null = null;
  let outputCost: number | null = null;

  if (model.input_price_per_m !== null && finalInputTokens > 0) {
    inputCost = (finalInputTokens / 1_000_000) * model.input_price_per_m;
  }
  if (model.output_price_per_m !== null && finalOutputTokens > 0) {
    outputCost = (finalOutputTokens / 1_000_000) * model.output_price_per_m;
  }

  // Push to BigQuery (primary data store for responses)
  const bqRow: BigQueryRow = {
    id: responseId,
    prompt_id: finalPromptId,
    collected_at: collectedAt,
    source: 'collect',
    company: extractCompany(model.provider, model.model_name),
    product: extractProductFamily(model.model_name),
    model: model.model_name,
    topic_id: finalTopicId,
    topic_name: finalTopicName,
    prompt_template_id: promptTemplateId,
    prompt_template_name: promptTemplate.name,
    prompt,
    response: rawResponse || null,
    reasoning_content: reasoningContent,
    latency_ms: latencyMs,
    input_tokens: finalInputTokens,
    output_tokens: finalOutputTokens,
    input_cost: inputCost,
    output_cost: outputCost,
    error,
    success: !error,
  };

  const bqResult = await insertRow(env, bqRow);
  if (!bqResult.success) {
    console.error('BigQuery insert failed:', bqResult.error);
    // Still return success if LLM call succeeded - BQ failure is logged but not blocking
    if (error) {
      return { success: false, responseId, error };
    }
    return { success: true, responseId, latencyMs, error: `Warning: BigQuery insert failed: ${bqResult.error}` };
  }

  if (error) {
    return { success: false, responseId, error };
  }

  return { success: true, responseId, latencyMs };
}
