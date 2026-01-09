import { describe, it, expect, vi } from 'vitest';

// Mock the LLM provider
vi.mock('../src/services/llm', () => ({
  createLLMProvider: vi.fn(() => ({
    id: 'test-model',
    complete: vi.fn().mockResolvedValue({
      content: 'Test response content',
      inputTokens: 10,
      outputTokens: 50,
      latencyMs: 1000,
    }),
  })),
}));

describe('Collector Service', () => {
  it('should exist', () => {
    expect(true).toBe(true);
  });
});
