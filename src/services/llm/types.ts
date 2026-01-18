export interface LLMRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface Citation {
  url: string;
  title?: string;
}

export interface LLMResponse {
  content: string;
  reasoningContent?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  citations?: Citation[];
  searchQueries?: string[];
}

export interface LLMProvider {
  id: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
