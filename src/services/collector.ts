import type { Env } from '../types/env';
import { getModel, getPromptTemplate } from './storage';
import { insertRow, extractProductFamily, extractCompany, type BigQueryRow } from './bigquery';
import { estimateTokens } from './llm/tokens';

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
    if (model.provider === 'openai') {
      const result = await callOpenAI(prompt, model.model_name, env.OPENAI_API_KEY);
      rawResponse = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    } else if (model.provider === 'anthropic') {
      const result = await callAnthropic(prompt, model.model_name, env.ANTHROPIC_API_KEY);
      rawResponse = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    } else if (model.provider === 'google') {
      const result = await callGoogle(prompt, model.model_name, env.GOOGLE_API_KEY);
      rawResponse = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    } else if (model.provider === 'cloudflare') {
      const result = await callCloudflare(prompt, model.model_name, env.AI);
      rawResponse = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    } else if (model.provider === 'xai') {
      const result = await callXAI(prompt, model.model_name, env.XAI_API_KEY);
      rawResponse = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    } else if (model.provider === 'deepseek') {
      const result = await callDeepSeek(prompt, model.model_name, env.DEEPSEEK_API_KEY);
      rawResponse = result.content;
      reasoningContent = result.reasoningContent ?? null;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    } else {
      throw new Error(`Unknown provider: ${model.provider}`);
    }
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

interface LLMResponse {
  content: string;
  reasoningContent?: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

async function callOpenAI(prompt: string, model: string, apiKey: string): Promise<LLMResponse> {
  // Newer models (o1, o3, gpt-5+) use max_completion_tokens instead of max_tokens
  const usesCompletionTokens =
    model.startsWith('o1') || model.startsWith('o3') || model.startsWith('gpt-5');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(usesCompletionTokens ? { max_completion_tokens: 1024 } : { max_tokens: 1024 }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

async function callAnthropic(prompt: string, model: string, apiKey: string): Promise<LLMResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content[0]?.text ?? '',
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null,
  };
}

async function callGoogle(prompt: string, model: string, apiKey: string): Promise<LLMResponse> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
  };

  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    inputTokens: data.usageMetadata?.promptTokenCount ?? null,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
  };
}

async function callCloudflare(prompt: string, model: string, ai: Ai): Promise<LLMResponse> {
  const response = (await ai.run(model as Parameters<Ai['run']>[0], {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  })) as
    | { response?: string }
    | { choices?: Array<{ message?: { content?: string } }> }
    | string;

  // Cloudflare AI models return different formats:
  // - Legacy models: { response: string }
  // - Newer models (Qwen3, etc): OpenAI-compatible { choices: [{ message: { content: string } }] }
  let content = '';
  if (typeof response === 'string') {
    content = response;
  } else if ('choices' in response && response.choices?.[0]?.message?.content) {
    content = response.choices[0].message.content;
  } else if ('response' in response && response.response) {
    content = response.response;
  }

  // Strip reasoning model thinking blocks
  // Handles both <think>...</think> and cases where opening tag is missing (common with QwQ)
  content = content.replace(/^[\s\S]*?<\/think>\s*/g, '').trim();

  if (!content) {
    throw new Error('Cloudflare AI returned empty response');
  }

  // Estimate tokens since Cloudflare AI doesn't return token counts
  return {
    content,
    inputTokens: estimateTokens(prompt),
    outputTokens: estimateTokens(content),
  };
}

async function callDeepSeek(prompt: string, model: string, apiKey: string): Promise<LLMResponse> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string; reasoning_content?: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '',
    reasoningContent: data.choices[0]?.message?.reasoning_content,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

async function callXAI(prompt: string, model: string, apiKey: string): Promise<LLMResponse> {
  // xAI API is OpenAI-compatible
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`xAI API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}
