import type { LLMProvider, LLMRequest, LLMResponse, Citation } from './types';
import { LLMError } from './types';

interface XAIChatResponse {
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

interface XAIContentItem {
  type: string;
  text?: string;
  url?: string;
  title?: string;
}

interface XAIOutputItem {
  type: string;
  content?: XAIContentItem[];
  role?: string;
}

interface XAIResponsesResult {
  output: XAIOutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class XAIProvider implements LLMProvider {
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

    // Use different endpoint for grounded requests
    if (this.grounded) {
      return this.completeWithGrounding(request, maxTokens, temperature, startTime);
    }

    // xAI API is OpenAI-compatible
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
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
        `xAI API error: ${errorText}`,
        'xai',
        response.status
      );
    }

    const data = (await response.json()) as XAIChatResponse;

    if (!data.choices?.[0]?.message?.content) {
      throw new LLMError('xAI returned empty response', 'xai');
    }

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      latencyMs,
    };
  }

  private async completeWithGrounding(
    request: LLMRequest,
    maxTokens: number,
    temperature: number,
    startTime: number
  ): Promise<LLMResponse> {
    // xAI uses /v1/responses endpoint for web search
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        input: request.prompt,
        max_tokens: maxTokens,
        temperature,
        tools: [{ type: 'web_search' }],
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `xAI API error: ${errorText}`,
        'xai',
        response.status
      );
    }

    const data = (await response.json()) as XAIResponsesResult;

    // Extract text content and citations from output
    let content = '';
    const citations: Citation[] = [];

    for (const outputItem of data.output || []) {
      if (outputItem.type === 'message' && outputItem.content) {
        for (const contentItem of outputItem.content) {
          if (contentItem.type === 'output_text' && contentItem.text) {
            content = contentItem.text;
          } else if (contentItem.type === 'web_search_result' && contentItem.url) {
            citations.push({
              url: contentItem.url,
              title: contentItem.title,
            });
          }
        }
      }
    }

    if (!content) {
      throw new LLMError('xAI returned empty response', 'xai');
    }

    return {
      content,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      latencyMs,
      ...(citations.length > 0 && { citations }),
    };
  }
}
