import type { LLMProvider, LLMRequest, LLMResponse } from './types';
import { LLMError } from './types';

interface AnthropicMessagesResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly apiKey: string
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = request.maxTokens ?? 1024;
    const temperature = request.temperature ?? 0.7;

    const startTime = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
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
        `Anthropic API error: ${errorText}`,
        'anthropic',
        response.status
      );
    }

    const data = (await response.json()) as AnthropicMessagesResponse;

    const textContent = data.content.find((block) => block.type === 'text');
    if (!textContent?.text) {
      throw new LLMError('Anthropic returned empty response', 'anthropic');
    }

    return {
      content: textContent.text,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      latencyMs,
    };
  }
}
