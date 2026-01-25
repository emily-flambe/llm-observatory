import type { SwarmSchedulerDONamespace } from '../services/scheduler-do';

export interface Env {
  // Bindings
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;
  SWARM_SCHEDULER: SwarmSchedulerDONamespace;

  // LLM Provider Secrets
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  XAI_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  PERPLEXITY_API_KEY: string;

  // BigQuery Config
  BQ_PROJECT_ID: string;
  BQ_DATASET_ID: string;
  BQ_TABLE_ID: string;
  BQ_SERVICE_ACCOUNT_EMAIL: string;
  BQ_PRIVATE_KEY: string;

  // Cloudflare Access Config
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;

  // Admin API Key (for Bearer token auth on protected routes)
  ADMIN_API_KEY: string;
}
