import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerplexityProvider } from '../perplexity';
import { LLMError } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;

describe('PerplexityProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('grounded mode (default)', () => {
    const provider = new PerplexityProvider('test-perplexity', 'sonar', 'test-api-key');

    it('sends prompt correctly in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Hello world' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.perplexity.ai/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"content":"Hello world"'),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toBe('Hello world');
      expect(body.messages[0].role).toBe('user');
    });

    it('includes web_search_options for grounded mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.web_search_options).toEqual({ search_context_size: 'medium' });
      expect(body.disable_search).toBeUndefined();
    });

    it('returns content and token counts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response text' } }],
          usage: { prompt_tokens: 15, completion_tokens: 8 },
        }),
      });

      const result = await provider.complete({ prompt: 'Test' });

      expect(result.content).toBe('Response text');
      expect(result.inputTokens).toBe(15);
      expect(result.outputTokens).toBe(8);
    });

    it('extracts citations from search_results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response with sources' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          search_results: [
            { url: 'https://example.com/1', title: 'Source 1' },
            { url: 'https://example.com/2', name: 'Source 2' },
          ],
        }),
      });

      const result = await provider.complete({ prompt: 'Test' });

      expect(result.citations).toHaveLength(2);
      expect(result.citations![0]).toEqual({ url: 'https://example.com/1', title: 'Source 1' });
      expect(result.citations![1]).toEqual({ url: 'https://example.com/2', title: 'Source 2' });
    });

    it('handles missing search_results gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const result = await provider.complete({ prompt: 'Test' });

      expect(result.citations).toBeUndefined();
    });

    it('throws LLMError on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(provider.complete({ prompt: 'Test' })).rejects.toThrow(LLMError);
    });

    it('throws LLMError when response is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      });

      await expect(provider.complete({ prompt: 'Test' })).rejects.toThrow(LLMError);
    });
  });

  describe('non-grounded mode', () => {
    const provider = new PerplexityProvider('test-perplexity-ng', 'sonar', 'test-api-key', false);

    it('sets disable_search to true for non-grounded mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.disable_search).toBe(true);
      expect(body.web_search_options).toBeUndefined();
    });

    it('returns content without citations in non-grounded mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Non-grounded response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const result = await provider.complete({ prompt: 'Test' });

      expect(result.content).toBe('Non-grounded response');
      expect(result.citations).toBeUndefined();
    });
  });

  describe('different model variants', () => {
    it('works with sonar-pro model', async () => {
      const provider = new PerplexityProvider('test-sonar-pro', 'sonar-pro', 'test-api-key');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('sonar-pro');
    });

    it('works with sonar-reasoning-pro model', async () => {
      const provider = new PerplexityProvider('test-reasoning', 'sonar-reasoning-pro', 'test-api-key');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('sonar-reasoning-pro');
    });
  });

  describe('request parameters', () => {
    const provider = new PerplexityProvider('test-perplexity', 'sonar', 'test-api-key');

    it('uses default temperature of 0.2', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.2);
    });

    it('uses provided temperature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test', temperature: 0.8 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.8);
    });

    it('uses default max_tokens of 1024', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(1024);
    });

    it('uses provided maxTokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test', maxTokens: 2048 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(2048);
    });

    it('includes correct Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.complete({ prompt: 'Test' });

      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-api-key');
    });
  });
});
