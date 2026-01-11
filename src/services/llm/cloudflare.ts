import type { LLMProvider, LLMRequest, LLMResponse } from './types';
import { LLMError } from './types';

/**
 * Estimate token count from text using character-based heuristic.
 * Average of ~4 characters per token for English text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class CloudflareProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly ai: Ai
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = request.maxTokens ?? 1024;

    const startTime = Date.now();

    const response = (await this.ai.run(this.modelName as Parameters<Ai['run']>[0], {
      messages: [{ role: 'user', content: request.prompt }],
      max_tokens: maxTokens,
    })) as
      | { response?: string }
      | { choices?: Array<{ message?: { content?: string } }> }
      | string;

    const latencyMs = Date.now() - startTime;

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

    // Strip Qwen3 thinking blocks (content between <think>...</think> tags)
    content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

    if (!content) {
      throw new LLMError('Cloudflare AI returned empty response', 'cloudflare');
    }

    // Estimate tokens since Cloudflare AI doesn't return token counts
    const inputTokens = estimateTokens(request.prompt);
    const outputTokens = estimateTokens(content);

    return {
      content,
      inputTokens,
      outputTokens,
      latencyMs,
    };
  }
}
