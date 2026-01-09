import type { Env } from '../types/env';
import { getTopic, getModel, saveResponse } from './storage';

export interface CollectionResult {
  success: boolean;
  responseId: string;
  latencyMs?: number;
  error?: string;
}

export async function collectForTopic(
  topicId: string,
  modelId: string,
  env: Env
): Promise<CollectionResult> {
  const responseId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();

  const topic = await getTopic(env.DB, topicId);
  if (!topic) {
    return { success: false, responseId, error: `Topic not found: ${topicId}` };
  }

  const model = await getModel(env.DB, modelId);
  if (!model) {
    return { success: false, responseId, error: `Model not found: ${modelId}` };
  }

  const prompt = `What is the current state of "${topic.name}"? Provide a brief, factual summary.`;

  const startTime = Date.now();
  let rawResponse = '';
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
    } else {
      throw new Error(`Unknown provider: ${model.provider}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const latencyMs = Date.now() - startTime;

  await saveResponse(env.DB, {
    id: responseId,
    topic_id: topicId,
    model_id: modelId,
    prompt,
    raw_response: rawResponse,
    collected_at: collectedAt,
    latency_ms: latencyMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    error,
  });

  if (error) {
    return { success: false, responseId, error };
  }

  return { success: true, responseId, latencyMs };
}

interface LLMResponse {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

async function callOpenAI(prompt: string, model: string, apiKey: string): Promise<LLMResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
