import type { LLMProvider, LLMRequest, LLMResponse, Citation } from './types';
import { LLMError } from './types';

interface PerplexitySearchResult {
  url: string;
  name?: string;
  title?: string;
}

interface PerplexityChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  search_results?: PerplexitySearchResult[];
}

export class PerplexityProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly apiKey: string,
    private readonly grounded: boolean = true
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = request.maxTokens ?? 1024;
    const temperature = request.temperature ?? 0.2;

    const startTime = Date.now();

    // Build request body
    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages: [{ role: 'user', content: request.prompt }],
      max_tokens: maxTokens,
      temperature,
    };

    // Configure search behavior based on grounded flag
    if (this.grounded) {
      // Grounded: enable web search with medium context size
      requestBody.web_search_options = { search_context_size: 'medium' };
    } else {
      // Non-grounded: disable search, use only training data
      requestBody.disable_search = true;
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `Perplexity API error: ${errorText}`,
        'perplexity',
        response.status
      );
    }

    const data = (await response.json()) as PerplexityChatResponse;

    if (!data.choices?.[0]?.message?.content) {
      throw new LLMError('Perplexity returned empty response', 'perplexity');
    }

    // Extract citations from search_results
    const citations: Citation[] = [];
    if (data.search_results) {
      for (const result of data.search_results) {
        if (result.url) {
          citations.push({
            url: result.url,
            title: result.title || result.name,
          });
        }
      }
    }

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      latencyMs,
      ...(citations.length > 0 && { citations }),
    };
  }
}
