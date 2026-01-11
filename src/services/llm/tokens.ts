/**
 * Token estimation utilities for LLM responses.
 */

/**
 * Estimate token count from text using character-based heuristic.
 * Average of ~4 characters per token for English text.
 * Used for providers that don't return token counts (e.g., Cloudflare AI).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
