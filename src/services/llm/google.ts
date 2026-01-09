import type { LLMProvider, LLMRequest, LLMResponse } from './types';
import { LLMError } from './types';

export class GoogleProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly apiKey: string
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: request.prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxTokens ?? 1024,
            temperature: request.temperature ?? 0.7,
          },
        }),
      }
    );

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `Google API error: ${response.status} ${errorText}`,
        'google',
        response.status
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content: {
          parts: Array<{ text: string }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
      };
      error?: { message: string };
    };

    if (data.error) {
      throw new LLMError(data.error.message, 'google');
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return {
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs,
    };
  }
}
