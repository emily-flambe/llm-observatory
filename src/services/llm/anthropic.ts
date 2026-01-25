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
  stop_reason: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_CONTINUATION_TURNS = 5;

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

    const messages: AnthropicMessage[] = [{ role: 'user', content: request.prompt }];

    // Accumulated response data across continuation turns
    const allTextContent: string[] = [];
    const allCitations: Citation[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Handle pause_turn by continuing conversation
    for (let turn = 0; turn < MAX_CONTINUATION_TURNS; turn++) {
      const data = await this.makeRequest(messages, maxTokens, temperature);

      // Accumulate token counts
      totalInputTokens += data.usage.input_tokens;
      totalOutputTokens += data.usage.output_tokens;

      // Extract all text content from this response
      const textBlocks = data.content.filter((block) => block.type === 'text' && block.text);
      for (const block of textBlocks) {
        if (block.text) {
          allTextContent.push(block.text);
        }
      }

      // Extract citations from web_search_result blocks
      for (const block of data.content) {
        if (block.type === 'web_search_result' && block.target_url) {
          allCitations.push({
            url: block.target_url,
            title: block.title,
          });
        }
      }

      // If not pause_turn, we're done
      if (data.stop_reason !== 'pause_turn') {
        break;
      }

      // For pause_turn, add assistant's response to messages and continue
      messages.push({
        role: 'assistant',
        content: data.content,
      });
    }

    const latencyMs = Date.now() - startTime;

    const finalContent = allTextContent.join('');
    if (!finalContent) {
      throw new LLMError('Anthropic returned empty response', 'anthropic');
    }

    return {
      content: finalContent,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      latencyMs,
      ...(allCitations.length > 0 && { citations: allCitations }),
    };
  }

  private async makeRequest(
    messages: AnthropicMessage[],
    maxTokens: number,
    temperature: number
  ): Promise<AnthropicMessagesResponse> {
    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    // Add web search tool for grounded models
    if (this.grounded) {
      requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };

    // Add beta header for web search
    if (this.grounded) {
      headers['anthropic-beta'] = 'web-search-2025-03-05';
    }

    // Retry loop for transient errors (overloaded, rate limits)
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        return (await response.json()) as AnthropicMessagesResponse;
      }

      const errorText = await response.text();

      // Check if it's a retryable error
      const isOverloaded = errorText.includes('overloaded_error');
      const isRateLimit = response.status === 429;

      if ((isOverloaded || isRateLimit) && attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
        continue;
      }

      throw new LLMError(`Anthropic API error: ${errorText}`, 'anthropic', response.status);
    }

    // Should not reach here, but TypeScript needs this
    throw new LLMError('Anthropic API error: max retries exceeded', 'anthropic');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
