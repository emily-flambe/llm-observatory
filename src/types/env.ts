export interface Env {
  // Bindings
  DB: D1Database;
  ASSETS: Fetcher;

  // Secrets
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  ADMIN_API_KEY: string;
}
