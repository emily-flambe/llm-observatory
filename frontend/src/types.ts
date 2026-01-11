// Shared types for frontend components

export interface Topic {
  id: string;
  name: string;
  description: string | null;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description: string | null;
}

export interface Model {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
}

export interface Response {
  id: string;
  collected_at: string;
  company: string;
  product: string;
  model: string;
  topic_id: string;
  topic_name: string;
  prompt_template_id: string;
  prompt_template_name: string;
  prompt: string;
  response: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  success: boolean;
}

// API response types
export interface TopicsResponse {
  topics: Topic[];
}

export interface PromptTemplatesResponse {
  templates: PromptTemplate[];
}

export interface ModelsResponse {
  models: Model[];
}

export interface ResponsesResponse {
  responses: Response[];
  totalRows: number;
}

export interface CollectionResult {
  modelId: string;
  iteration: number;
  success: boolean;
  responseId: string;
  latencyMs?: number;
  error?: string;
}

export interface CollectionBatchResponse {
  total: number;
  successful: number;
  failed: number;
  results: CollectionResult[];
}

// Prompt Lab history types
export interface PromptLabResponse {
  model: string;
  company: string;
  response: string | null;
  latency_ms: number;
  error: string | null;
  success: boolean;
}

export interface PromptLabQuery {
  id: string;
  collected_at: string;
  prompt: string;
  topic_name: string | null;
  source: string;
  responses: PromptLabResponse[];
}

export interface PromptsResponse {
  prompts: PromptLabQuery[];
}
