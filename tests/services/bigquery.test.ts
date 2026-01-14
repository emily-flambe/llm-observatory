import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractCompany, extractProductFamily, getCollectionResponses, setTokenCache, clearTokenCache, type BigQueryEnv } from '../../src/services/bigquery';

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

    it('returns xAI for xai provider', () => {
      expect(extractCompany('xai', 'grok-3')).toBe('xAI');
      expect(extractCompany('xai', 'grok-3-mini')).toBe('xAI');
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

    it('extracts grok from Grok models', () => {
      expect(extractProductFamily('grok-3')).toBe('grok');
      expect(extractProductFamily('grok-3-mini')).toBe('grok');
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

describe('getCollectionResponses', () => {
  const mockEnv: BigQueryEnv = {
    BQ_SERVICE_ACCOUNT_EMAIL: 'test@test.iam.gserviceaccount.com',
    BQ_PRIVATE_KEY: btoa('fake-private-key'),
    BQ_PROJECT_ID: 'test-project',
    BQ_DATASET_ID: 'test-dataset',
    BQ_TABLE_ID: 'test-table',
  };

  beforeEach(() => {
    // Pre-seed token cache to bypass JWT signing
    setTokenCache('mock-access-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    clearTokenCache();
    vi.unstubAllGlobals();
  });

  // Helper to create BigQuery response structure
  const createBigQueryResponse = (rows: Array<{
    prompt_id: string;
    prompt: string;
    topic_name: string | null;
    source: string;
    collected_at: string;
    responses: Array<{
      id: string;
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
    }>;
  }>) => ({
    jobComplete: true,
    rows: rows.map((row) => ({
      f: [
        { v: row.prompt_id },
        { v: row.prompt },
        { v: row.topic_name },
        { v: row.source },
        { v: row.collected_at },
        {
          v: row.responses.map((r) => ({
            v: {
              f: [
                { v: r.id },
                { v: r.model },
                { v: r.company },
                { v: r.response },
                { v: String(r.latency_ms) },
                { v: String(r.input_tokens) },
                { v: String(r.output_tokens) },
                { v: r.input_cost !== null ? String(r.input_cost) : null },
                { v: r.output_cost !== null ? String(r.output_cost) : null },
                { v: r.error },
                { v: r.success },
              ],
            },
          })),
        },
      ],
    })),
  });

  it('parses BigQuery response with correct field indices', async () => {
    const mockData = createBigQueryResponse([
      {
        prompt_id: 'prompt-123',
        prompt: 'Test prompt',
        topic_name: 'Test Topic',
        source: 'collection',
        collected_at: '2024-01-01T00:00:00Z',
        responses: [
          {
            id: 'resp-1',
            model: 'gpt-4o',
            company: 'OpenAI',
            response: 'Test response',
            latency_ms: 1000,
            input_tokens: 100,
            output_tokens: 200,
            input_cost: 0.001,
            output_cost: 0.002,
            error: null,
            success: true,
          },
        ],
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getCollectionResponses(mockEnv, 'collection-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('prompt-123');
      expect(result.data[0].prompt).toBe('Test prompt');
      expect(result.data[0].responses).toHaveLength(1);

      const resp = result.data[0].responses[0];
      expect(resp.id).toBe('resp-1');
      expect(resp.model).toBe('gpt-4o');
      expect(resp.company).toBe('OpenAI');
      expect(resp.response).toBe('Test response');
      expect(resp.latency_ms).toBe(1000);
      expect(resp.input_tokens).toBe(100);
      expect(resp.output_tokens).toBe(200);
      expect(resp.input_cost).toBe(0.001);
      expect(resp.output_cost).toBe(0.002);
      expect(resp.error).toBeNull();
      expect(resp.success).toBe(true);
    }
  });

  it('handles empty responses array without crashing', async () => {
    const mockData = createBigQueryResponse([
      {
        prompt_id: 'prompt-empty',
        prompt: 'Test prompt',
        topic_name: null,
        source: 'collection',
        collected_at: '2024-01-01T00:00:00Z',
        responses: [],
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getCollectionResponses(mockEnv, 'collection-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].responses).toHaveLength(0);
    }
  });

  it('handles null responses array from BigQuery', async () => {
    // Simulate BigQuery returning null for empty ARRAY_AGG
    const mockData = {
      jobComplete: true,
      rows: [
        {
          f: [
            { v: 'prompt-null' },
            { v: 'Test prompt' },
            { v: null },
            { v: 'collection' },
            { v: '2024-01-01T00:00:00Z' },
            { v: null }, // null array
          ],
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getCollectionResponses(mockEnv, 'collection-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].responses).toHaveLength(0);
    }
  });

  it('handles no matching rows (empty result)', async () => {
    const mockData = {
      jobComplete: true,
      rows: [],
    };

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getCollectionResponses(mockEnv, 'nonexistent-collection');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('handles multiple responses per execution', async () => {
    const mockData = createBigQueryResponse([
      {
        prompt_id: 'prompt-multi',
        prompt: 'Test prompt',
        topic_name: 'Topic',
        source: 'collection',
        collected_at: '2024-01-01T00:00:00Z',
        responses: [
          {
            id: 'resp-1',
            model: 'gpt-4o',
            company: 'OpenAI',
            response: 'Response 1',
            latency_ms: 1000,
            input_tokens: 100,
            output_tokens: 200,
            input_cost: 0.001,
            output_cost: 0.002,
            error: null,
            success: true,
          },
          {
            id: 'resp-2',
            model: 'claude-3-sonnet',
            company: 'Anthropic',
            response: 'Response 2',
            latency_ms: 1500,
            input_tokens: 150,
            output_tokens: 250,
            input_cost: 0.0015,
            output_cost: 0.0025,
            error: null,
            success: true,
          },
          {
            id: 'resp-3',
            model: 'gemini-pro',
            company: 'Google',
            response: null,
            latency_ms: 0,
            input_tokens: 0,
            output_tokens: 0,
            input_cost: null,
            output_cost: null,
            error: 'API error',
            success: false,
          },
        ],
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getCollectionResponses(mockEnv, 'collection-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].responses).toHaveLength(3);

      // Verify first response
      expect(result.data[0].responses[0].model).toBe('gpt-4o');
      expect(result.data[0].responses[0].success).toBe(true);

      // Verify second response
      expect(result.data[0].responses[1].model).toBe('claude-3-sonnet');
      expect(result.data[0].responses[1].company).toBe('Anthropic');

      // Verify failed response
      expect(result.data[0].responses[2].model).toBe('gemini-pro');
      expect(result.data[0].responses[2].success).toBe(false);
      expect(result.data[0].responses[2].error).toBe('API error');
      expect(result.data[0].responses[2].response).toBeNull();
    }
  });
});
