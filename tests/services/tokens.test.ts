import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../../src/services/llm/tokens';

describe('Token Estimation', () => {
  it('estimates tokens using ~4 chars per token', () => {
    // 20 chars = 5 tokens
    expect(estimateTokens('12345678901234567890')).toBe(5);
  });

  it('rounds up partial tokens', () => {
    // 5 chars = 1.25 tokens, rounds to 2
    expect(estimateTokens('hello')).toBe(2);
    // 1 char = 0.25 tokens, rounds to 1
    expect(estimateTokens('a')).toBe(1);
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles longer text', () => {
    // 100 chars = 25 tokens
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it('handles unicode characters', () => {
    // Unicode chars are still counted by string length
    const emoji = '👍👍👍👍'; // 4 emoji = 8 chars (surrogate pairs) = 2 tokens
    expect(estimateTokens(emoji)).toBe(2);
  });
});

describe('Cost Calculation', () => {
  // Cost formula: (tokens / 1_000_000) * pricePerMillion
  const calculateCost = (tokens: number, pricePerMillion: number): number => {
    return (tokens / 1_000_000) * pricePerMillion;
  };

  it('calculates input cost correctly', () => {
    // 1000 tokens at $2.50/M = $0.0025
    expect(calculateCost(1000, 2.5)).toBeCloseTo(0.0025, 6);
  });

  it('calculates output cost correctly', () => {
    // 500 tokens at $10/M = $0.005
    expect(calculateCost(500, 10)).toBeCloseTo(0.005, 6);
  });

  it('handles zero tokens', () => {
    expect(calculateCost(0, 2.5)).toBe(0);
  });

  it('handles typical GPT-4o pricing', () => {
    // GPT-4o: $2.50/M input, $10.00/M output
    // 100 input tokens + 200 output tokens
    const inputCost = calculateCost(100, 2.5);
    const outputCost = calculateCost(200, 10);
    const totalCost = inputCost + outputCost;
    // 0.00025 + 0.002 = 0.00225
    expect(totalCost).toBeCloseTo(0.00225, 6);
  });

  it('handles typical Claude pricing', () => {
    // Claude Sonnet 4.5: $3.00/M input, $15.00/M output
    // 150 input tokens + 300 output tokens
    const inputCost = calculateCost(150, 3);
    const outputCost = calculateCost(300, 15);
    const totalCost = inputCost + outputCost;
    // 0.00045 + 0.0045 = 0.00495
    expect(totalCost).toBeCloseTo(0.00495, 6);
  });

  it('handles cheap Cloudflare models', () => {
    // Llama 3.1 8B: $0.03/M input, $0.20/M output
    // 500 input tokens + 1000 output tokens
    const inputCost = calculateCost(500, 0.03);
    const outputCost = calculateCost(1000, 0.2);
    const totalCost = inputCost + outputCost;
    // 0.000015 + 0.0002 = 0.000215
    expect(totalCost).toBeCloseTo(0.000215, 6);
  });
});
