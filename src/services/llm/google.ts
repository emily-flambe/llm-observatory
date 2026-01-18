import type { LLMProvider, LLMRequest, LLMResponse, Citation } from './types';
import { LLMError } from './types';

interface GoogleGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GoogleGroundingMetadata {
  groundingChunks?: GoogleGroundingChunk[];
  searchEntryPoint?: {
    renderedContent?: string;
  };
  webSearchQueries?: string[];
}

interface GoogleResponseData {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    groundingMetadata?: GoogleGroundingMetadata;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
  error?: { message: string };
}

export class GoogleProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    private readonly modelName: string,
    private readonly apiKey: string,
    private readonly grounded: boolean = false
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    // Build request body
    const requestBody: Record<string, unknown> = {
      contents: [
        {
          parts: [{ text: request.prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      },
    };

    // Add Google Search tool for grounded models
    if (this.grounded) {
      requestBody.tools = [{ google_search: {} }];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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

    const data = (await response.json()) as GoogleResponseData;

    if (data.error) {
      throw new LLMError(data.error.message, 'google');
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extract citations and search queries from grounding metadata
    const citations: Citation[] = [];
    const searchQueries: string[] = [];
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;

    if (groundingMetadata) {
      // Extract citations from grounding chunks
      if (groundingMetadata.groundingChunks) {
        for (const chunk of groundingMetadata.groundingChunks) {
          if (chunk.web?.uri) {
            citations.push({
              url: chunk.web.uri,
              title: chunk.web.title,
            });
          }
        }
      }

      // Extract search queries
      if (groundingMetadata.webSearchQueries) {
        searchQueries.push(...groundingMetadata.webSearchQueries);
      }
    }

    return {
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs,
      ...(citations.length > 0 && { citations }),
      ...(searchQueries.length > 0 && { searchQueries }),
    };
  }
}
