import type { LLMProvider, LLMRequest, LLMResponse, Citation } from './types';
import { LLMError } from './types';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  encrypted_content?: string;
  target_url?: string;
  title?: string;
}

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly apiKey: string,
    private readonly grounded: boolean = false
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = request.maxTokens ?? 1024;
    const temperature = request.temperature ?? 0.7;

    const startTime = Date.now();

    // Build request body
    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages: [{ role: 'user', content: request.prompt }],
      max_tokens: maxTokens,
      temperature,
    };

    // Add web search tool for grounded models
    if (this.grounded) {
      requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
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

    // Extract text content
    const textContent = data.content.find((block) => block.type === 'text');
    if (!textContent?.text) {
      throw new LLMError('Anthropic returned empty response', 'anthropic');
    }

    // Extract citations from web_search_result blocks
    const citations: Citation[] = [];
    for (const block of data.content) {
      if (block.type === 'web_search_result' && block.target_url) {
        citations.push({
          url: block.target_url,
          title: block.title,
        });
      }
    }

    return {
      content: textContent.text,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      latencyMs,
      ...(citations.length > 0 && { citations }),
    };
  }
}
