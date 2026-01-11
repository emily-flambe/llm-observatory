import type { LLMProvider, LLMRequest, LLMResponse } from './types';
import { LLMError } from './types';

interface DeepSeekChatResponse {
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class DeepSeekProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly apiKey: string
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = request.maxTokens ?? 8192; // DeepSeek reasoner needs more tokens
    // Note: temperature is ignored by deepseek-reasoner model

    const startTime = Date.now();

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: maxTokens,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `DeepSeek API error: ${errorText}`,
        'deepseek',
        response.status
      );
    }

    const data = (await response.json()) as DeepSeekChatResponse;

    if (!data.choices?.[0]?.message?.content) {
      throw new LLMError('DeepSeek returned empty response', 'deepseek');
    }

    return {
      content: data.choices[0].message.content,
      reasoningContent: data.choices[0].message.reasoning_content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      latencyMs,
    };
  }
}
