import type { LLMProvider, LLMRequest, LLMResponse } from './types';
import { LLMError } from './types';

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class OpenAIProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly apiKey: string
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = request.maxTokens ?? 1024;
    const temperature = request.temperature ?? 0.7;

    const startTime = Date.now();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `OpenAI API error: ${errorText}`,
        'openai',
        response.status
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;

    if (!data.choices?.[0]?.message?.content) {
      throw new LLMError('OpenAI returned empty response', 'openai');
    }

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      latencyMs,
    };
  }
}
