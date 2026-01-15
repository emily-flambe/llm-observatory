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
  company: string; // Actual creator (e.g., "Meta" not "cloudflare")
  model_type: string;
  source: 'auto' | 'manual';
  released_at: string | null;
  knowledge_cutoff: string | null;
  input_price_per_m: number | null; // USD per million input tokens
  output_price_per_m: number | null; // USD per million output tokens
  description: string | null;
  family: string | null;
  context_window: number | null;
  max_output_tokens: number | null;
  supports_reasoning: number | null; // 0/1 boolean
  supports_tool_calls: number | null; // 0/1 boolean
  supports_attachments: number | null; // 0/1 boolean
  open_weights: number | null; // 0/1 boolean
  input_modalities: string | null; // JSON array as string
  output_modalities: string | null; // JSON array as string
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
  input_cost: number | null;
  output_cost: number | null;
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
  input_tokens: number;
  output_tokens: number;
  input_cost: number | null;
  output_cost: number | null;
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

// Tag types
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// Collection types
export interface Collection {
  id: string;
  topic_id: string;
  template_id: string;
  prompt_text: string;
  display_name: string | null;
  disabled: number;
  created_at: string;
  last_run_at: string | null;
  topic_name: string;
  template_name: string;
  current_version: number;
  model_count: number;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression: string | null;
  is_paused: number;
}

export interface CollectionsResponse {
  collections: Collection[];
}

export interface CollectionModel {
  id: string;
  display_name: string;
  provider: string;
}

export interface CollectionVersion {
  version: number;
  model_ids: string[];
  created_at: string;
}

export interface CollectionDetail extends Collection {
  models: CollectionModel[];
  versions: CollectionVersion[];
}
