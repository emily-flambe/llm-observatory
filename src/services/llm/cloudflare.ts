import type { LLMProvider, LLMRequest, LLMResponse } from './types';
import { LLMError } from './types';

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
    })) as { response?: string } | string;

    const latencyMs = Date.now() - startTime;

    // Cloudflare AI text generation models return { response: string }
    const content =
      typeof response === 'string'
        ? response
        : response?.response ?? '';

    if (!content) {
      throw new LLMError('Cloudflare AI returned empty response', 'cloudflare');
    }

    return {
      content,
      inputTokens: 0, // Cloudflare AI doesn't return token counts
      outputTokens: 0,
      latencyMs,
    };
  }
}
