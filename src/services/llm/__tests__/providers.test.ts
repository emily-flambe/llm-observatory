import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../openai';
import { AnthropicProvider } from '../anthropic';
import { GoogleProvider } from '../google';
import { CloudflareProvider } from '../cloudflare';
import { LLMError } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAIProvider', () => {
  const provider = new OpenAIProvider('test-openai', 'gpt-4o', 'test-api-key');

  beforeEach(() => {
    mockFetch.mockReset();
  });

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
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"content":"Hello world"'),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe('Hello world');
    expect(body.messages[0].role).toBe('user');
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

describe('AnthropicProvider', () => {
  const provider = new AnthropicProvider('test-anthropic', 'claude-sonnet-4-20250514', 'test-api-key');

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends prompt correctly in request body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Hello!' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    await provider.complete({ prompt: 'Hello world' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"content":"Hello world"'),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe('Hello world');
    expect(body.messages[0].role).toBe('user');
  });

  it('returns content and token counts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Response text' }],
        usage: { input_tokens: 15, output_tokens: 8 },
      }),
    });

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('Response text');
    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(8);
  });

  it('includes anthropic-version header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    await provider.complete({ prompt: 'Test' });

    expect(mockFetch.mock.calls[0][1].headers['anthropic-version']).toBe('2023-06-01');
  });

  it('throws LLMError on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ type: 'error', error: { message: 'Bad request' } }),
    });

    await expect(provider.complete({ prompt: 'Test' })).rejects.toThrow(LLMError);
  });
});

describe('GoogleProvider', () => {
  const provider = new GoogleProvider('test-google', 'gemini-2.0-flash', 'test-api-key');

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends prompt correctly in request body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello!' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    });

    await provider.complete({ prompt: 'Hello world' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe('Hello world');
  });

  it('uses correct API URL with model name and key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }],
      }),
    });

    await provider.complete({ prompt: 'Test' });

    expect(mockFetch.mock.calls[0][0]).toContain('gemini-2.0-flash:generateContent');
    expect(mockFetch.mock.calls[0][0]).toContain('key=test-api-key');
  });

  it('returns content and token counts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Response text' }] } }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8 },
      }),
    });

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('Response text');
    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(8);
  });

  it('throws LLMError on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'Invalid request' } }),
    });

    await expect(provider.complete({ prompt: 'Test' })).rejects.toThrow(LLMError);
  });
});

describe('CloudflareProvider', () => {
  const mockAi = {
    run: vi.fn(),
  };
  const provider = new CloudflareProvider(
    'test-cloudflare',
    '@cf/meta/llama-3.1-8b-instruct-fast',
    mockAi as unknown as Ai
  );

  beforeEach(() => {
    mockAi.run.mockReset();
  });

  it('sends prompt correctly to AI.run', async () => {
    mockAi.run.mockResolvedValueOnce({ response: 'Hello!' });

    await provider.complete({ prompt: 'Hello world' });

    expect(mockAi.run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.1-8b-instruct-fast',
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Hello world' }],
      })
    );
  });

  it('returns content from object response', async () => {
    mockAi.run.mockResolvedValueOnce({ response: 'Response text' });

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('Response text');
  });

  it('returns content from string response', async () => {
    mockAi.run.mockResolvedValueOnce('Direct string response');

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('Direct string response');
  });

  it('returns content from OpenAI-compatible choices format', async () => {
    mockAi.run.mockResolvedValueOnce({
      choices: [{ message: { content: 'OpenAI format response' } }],
    });

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('OpenAI format response');
  });

  it('throws LLMError when response is empty', async () => {
    mockAi.run.mockResolvedValueOnce({ response: '' });

    await expect(provider.complete({ prompt: 'Test' })).rejects.toThrow(LLMError);
  });

  it('throws LLMError when choices array is empty', async () => {
    mockAi.run.mockResolvedValueOnce({ choices: [] });

    await expect(provider.complete({ prompt: 'Test' })).rejects.toThrow(LLMError);
  });

  it('strips thinking blocks with both tags from response', async () => {
    mockAi.run.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              '<think>\nLet me think about this question...\nI should consider multiple factors.\n</think>\n\nThe answer is 42.',
          },
        },
      ],
    });

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('The answer is 42.');
    expect(result.content).not.toContain('<think>');
  });

  it('strips thinking when opening tag is missing (QwQ behavior)', async () => {
    mockAi.run.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              'Okay, let me think about this...\nI should consider factors.\n</think>\n\nThe answer is 42.',
          },
        },
      ],
    });

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('The answer is 42.');
    expect(result.content).not.toContain('</think>');
  });

  it('handles response with only thinking block', async () => {
    mockAi.run.mockResolvedValueOnce({
      choices: [{ message: { content: '<think>thinking only</think>' } }],
    });

    await expect(provider.complete({ prompt: 'Test' })).rejects.toThrow(LLMError);
  });

  it('returns content unchanged when no thinking tags present', async () => {
    mockAi.run.mockResolvedValueOnce({
      response: 'Just a normal response without any thinking.',
    });

    const result = await provider.complete({ prompt: 'Test' });

    expect(result.content).toBe('Just a normal response without any thinking.');
  });
});
