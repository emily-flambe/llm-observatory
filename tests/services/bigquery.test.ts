import { describe, it, expect } from 'vitest';
import { extractCompany, extractProductFamily } from '../../src/services/bigquery';

describe('extractCompany', () => {
  describe('direct API providers', () => {
    it('returns OpenAI for openai provider', () => {
      expect(extractCompany('openai', 'gpt-4o')).toBe('OpenAI');
    });

    it('returns Anthropic for anthropic provider', () => {
      expect(extractCompany('anthropic', 'claude-sonnet-4-5-20250929')).toBe('Anthropic');
    });

    it('returns Google for google provider', () => {
      expect(extractCompany('google', 'gemini-2.0-flash')).toBe('Google');
    });

    it('handles case-insensitive provider names', () => {
      expect(extractCompany('OpenAI', 'gpt-4o')).toBe('OpenAI');
      expect(extractCompany('ANTHROPIC', 'claude-sonnet')).toBe('Anthropic');
    });
  });

  describe('Cloudflare-hosted models', () => {
    it('returns Meta for meta vendor', () => {
      expect(extractCompany('cloudflare', '@cf/meta/llama-3.1-8b-instruct-fast')).toBe('Meta');
      expect(extractCompany('cloudflare', '@cf/meta/llama-4-scout-17b-16e-instruct')).toBe('Meta');
    });

    it('returns Qwen for qwen vendor', () => {
      expect(extractCompany('cloudflare', '@cf/qwen/qwen3-30b-a3b-fp8')).toBe('Qwen');
      expect(extractCompany('cloudflare', '@cf/qwen/qwq-32b')).toBe('Qwen');
    });

    it('returns Mistral AI for mistralai vendor', () => {
      expect(extractCompany('cloudflare', '@cf/mistralai/mistral-small-3.1-24b-instruct')).toBe('Mistral AI');
    });

    it('returns Google for google vendor', () => {
      expect(extractCompany('cloudflare', '@cf/google/gemma-3-12b-it')).toBe('Google');
    });

    it('returns DeepSeek for deepseek-ai vendor', () => {
      expect(extractCompany('cloudflare', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b')).toBe('DeepSeek');
    });

    it('returns raw vendor slug for unmapped vendors', () => {
      expect(extractCompany('cloudflare', '@cf/nvidia/some-model')).toBe('nvidia');
      expect(extractCompany('cloudflare', '@cf/unknown-vendor/model')).toBe('unknown-vendor');
    });
  });

  describe('edge cases', () => {
    it('handles malformed @cf/ paths', () => {
      // @cf/ with empty vendor returns empty string (edge case, won't occur in practice)
      expect(extractCompany('cloudflare', '@cf/')).toBe('');
      // @cf without trailing slash falls through to Cloudflare
      expect(extractCompany('cloudflare', '@cf')).toBe('Cloudflare');
    });

    it('returns Cloudflare when model does not start with @cf/', () => {
      expect(extractCompany('cloudflare', 'some-model')).toBe('Cloudflare');
      expect(extractCompany('cloudflare', '')).toBe('Cloudflare');
    });

    it('returns provider as-is for unknown providers', () => {
      expect(extractCompany('unknown-provider', 'model')).toBe('unknown-provider');
    });
  });
});

describe('extractProductFamily', () => {
  describe('standard model names', () => {
    it('extracts gpt from GPT models', () => {
      expect(extractProductFamily('gpt-4o')).toBe('gpt');
      expect(extractProductFamily('gpt-4-turbo')).toBe('gpt');
    });

    it('extracts claude from Claude models', () => {
      expect(extractProductFamily('claude-3-5-sonnet-20241022')).toBe('claude');
      expect(extractProductFamily('claude-sonnet-4-20250514')).toBe('claude');
    });

    it('extracts gemini from Gemini models', () => {
      expect(extractProductFamily('gemini-2.0-flash')).toBe('gemini');
    });
  });

  describe('Cloudflare Workers AI format', () => {
    it('extracts llama from Llama models', () => {
      expect(extractProductFamily('@cf/meta/llama-3.1-8b-instruct')).toBe('llama');
    });

    it('extracts qwen from Qwen models', () => {
      expect(extractProductFamily('@cf/qwen/qwen3-30b-a3b-fp8')).toBe('qwen');
      expect(extractProductFamily('@cf/qwen/qwq-32b')).toBe('qwq');
    });

    it('extracts gemma from Gemma models', () => {
      expect(extractProductFamily('@cf/google/gemma-3-12b-it')).toBe('gemma');
    });

    it('extracts mistral from Mistral models', () => {
      expect(extractProductFamily('@cf/mistralai/mistral-small-3.1-24b-instruct')).toBe('mistral');
    });

    it('extracts deepseek from DeepSeek models', () => {
      expect(extractProductFamily('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b')).toBe('deepseek');
    });
  });
});
