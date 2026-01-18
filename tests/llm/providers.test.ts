import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../../src/services/llm/anthropic';
import { GoogleProvider } from '../../src/services/llm/google';
import { OpenAIProvider } from '../../src/services/llm/openai';
import { XAIProvider } from '../../src/services/llm/xai';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LLM Providers - Grounding Support', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AnthropicProvider', () => {
    it('should not include web_search tool when grounded=false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Test response' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const provider = new AnthropicProvider('test-id', 'claude-3', 'test-key', false);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeUndefined();
    });

    it('should include web_search tool when grounded=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Test response' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const provider = new AnthropicProvider('test-id', 'claude-3', 'test-key', true);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search' }]);
    });

    it('should extract citations from web_search_result blocks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            { type: 'web_search_result', target_url: 'https://example.com', title: 'Example' },
            { type: 'text', text: 'Test response' },
          ],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const provider = new AnthropicProvider('test-id', 'claude-3', 'test-key', true);
      const result = await provider.complete({ prompt: 'Hello' });

      expect(result.citations).toEqual([{ url: 'https://example.com', title: 'Example' }]);
    });
  });

  describe('GoogleProvider', () => {
    it('should not include google_search tool when grounded=false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Test response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        }),
      });

      const provider = new GoogleProvider('test-id', 'gemini-pro', 'test-key', false);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeUndefined();
    });

    it('should include google_search tool when grounded=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Test response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        }),
      });

      const provider = new GoogleProvider('test-id', 'gemini-pro', 'test-key', true);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toEqual([{ google_search: {} }]);
    });

    it('should extract citations and search queries from grounding metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: { parts: [{ text: 'Test response' }] },
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
              webSearchQueries: ['test query'],
            },
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        }),
      });

      const provider = new GoogleProvider('test-id', 'gemini-pro', 'test-key', true);
      const result = await provider.complete({ prompt: 'Hello' });

      expect(result.citations).toEqual([{ url: 'https://example.com', title: 'Example' }]);
      expect(result.searchQueries).toEqual(['test query']);
    });
  });

  describe('OpenAIProvider', () => {
    it('should not include web_search_options when grounded=false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      });

      const provider = new OpenAIProvider('test-id', 'gpt-4', 'test-key', false);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.web_search_options).toBeUndefined();
    });

    it('should include web_search_options when grounded=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      });

      const provider = new OpenAIProvider('test-id', 'gpt-4', 'test-key', true);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.web_search_options).toEqual({ search_context_size: 'medium' });
    });

    it('should extract citations from annotations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Test response',
              annotations: [{ type: 'url_citation', url: 'https://example.com', title: 'Example' }],
            },
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      });

      const provider = new OpenAIProvider('test-id', 'gpt-4', 'test-key', true);
      const result = await provider.complete({ prompt: 'Hello' });

      expect(result.citations).toEqual([{ url: 'https://example.com', title: 'Example' }]);
    });
  });

  describe('XAIProvider', () => {
    it('should use /v1/chat/completions when grounded=false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      });

      const provider = new XAIProvider('test-id', 'grok-4', 'test-key', false);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.x.ai/v1/chat/completions');
    });

    it('should use /v1/responses with web_search tool when grounded=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: [{
            type: 'message',
            content: [{ type: 'output_text', text: 'Test response' }],
          }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const provider = new XAIProvider('test-id', 'grok-4', 'test-key', true);
      await provider.complete({ prompt: 'Hello' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.x.ai/v1/responses');
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toEqual([{ type: 'web_search' }]);
    });

    it('should extract citations from web_search_result output items', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: [{
            type: 'message',
            content: [
              { type: 'web_search_result', url: 'https://example.com', title: 'Example' },
              { type: 'output_text', text: 'Test response' },
            ],
          }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const provider = new XAIProvider('test-id', 'grok-4', 'test-key', true);
      const result = await provider.complete({ prompt: 'Hello' });

      expect(result.citations).toEqual([{ url: 'https://example.com', title: 'Example' }]);
    });
  });
});
