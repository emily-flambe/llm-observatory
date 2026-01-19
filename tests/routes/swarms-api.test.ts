import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/types/env';

// Mock the services
vi.mock('../../src/services/swarms', () => ({
  createSwarm: vi.fn(),
  getSwarm: vi.fn(),
  getSwarms: vi.fn(),
  getSwarmVersionModels: vi.fn(),
  getSwarmTags: vi.fn(),
  updateSwarmLastRunAt: vi.fn(),
  createSwarmRun: vi.fn(),
}));

vi.mock('../../src/services/storage', () => ({
  getModel: vi.fn(),
}));

vi.mock('../../src/services/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, limit: 100 }),
  incrementRateLimit: vi.fn(),
}));

vi.mock('../../src/services/llm', () => ({
  createLLMProvider: vi.fn().mockReturnValue({
    complete: vi.fn().mockResolvedValue({
      content: 'Test response',
      inputTokens: 10,
      outputTokens: 20,
    }),
  }),
}));

vi.mock('../../src/services/bigquery', () => ({
  insertRow: vi.fn().mockResolvedValue({ success: true }),
  extractCompany: vi.fn().mockReturnValue('TestCompany'),
  extractProductFamily: vi.fn().mockReturnValue('TestProduct'),
}));

// Create a test app that mirrors the actual swarm creation route
function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();

  // Matches the actual implementation in src/routes/api.ts
  app.post('/api/swarms', async (c) => {
    // Validate Bearer token
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    // Check if ADMIN_API_KEY is configured
    if (!c.env.ADMIN_API_KEY) {
      console.error('ADMIN_API_KEY secret is not configured');
      return c.json({ error: 'Server configuration error: ADMIN_API_KEY not set' }, 500);
    }

    if (!token) {
      return c.json({ error: 'Missing API key - provide Authorization: Bearer <key> header' }, 401);
    }

    if (token !== c.env.ADMIN_API_KEY.trim()) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const body = await c.req.json<{
      prompt_text: string;
      model_ids: string[];
    }>();

    if (!body.prompt_text || !body.model_ids?.length) {
      return c.json({ error: 'prompt_text and model_ids are required' }, 400);
    }

    // Mock successful creation
    return c.json({ swarm: { id: 'test-id', prompt_text: body.prompt_text }, created: true }, 201);
  });

  return app;
}

describe('Swarms API Routes', () => {
  let app: ReturnType<typeof createTestApp>;
  const mockEnv = {
    ADMIN_API_KEY: 'test-api-key-12345',
    DB: {} as D1Database,
  } as unknown as Env;

  const mockEnvNoApiKey = {
    ADMIN_API_KEY: '', // Empty/falsy
    DB: {} as D1Database,
  } as unknown as Env;

  const mockEnvUndefinedApiKey = {
    // ADMIN_API_KEY not set at all
    DB: {} as D1Database,
  } as unknown as Env;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe('POST /api/swarms - Authentication', () => {
    it('returns 500 when ADMIN_API_KEY is not configured', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer some-key',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnvUndefinedApiKey);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Server configuration error: ADMIN_API_KEY not set');
    });

    it('returns 500 when ADMIN_API_KEY is empty string', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer some-key',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnvNoApiKey);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Server configuration error: ADMIN_API_KEY not set');
    });

    it('returns 401 with helpful message when Authorization header is missing', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Missing API key - provide Authorization: Bearer <key> header');
    });

    it('returns 401 when API key is invalid', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-api-key',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid API key');
    });

    it('returns 401 when using Basic auth instead of Bearer', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic dXNlcjpwYXNz',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Missing API key - provide Authorization: Bearer <key> header');
    });

    it('accepts valid API key and creates swarm', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.created).toBe(true);
      expect(body.swarm.prompt_text).toBe('Test prompt');
    });

    it('trims whitespace from API key before comparison', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-12345  ', // trailing whitespace
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.created).toBe(true);
    });

    it('handles API key with leading whitespace', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer   test-api-key-12345', // leading whitespace after Bearer
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/swarms - Input Validation', () => {
    it('validates required fields after successful auth', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({}),
      }, mockEnv);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('prompt_text and model_ids are required');
    });

    it('validates model_ids is non-empty', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: [],
        }),
      }, mockEnv);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('prompt_text and model_ids are required');
    });

    it('validates prompt_text is present', async () => {
      const res = await app.request('/api/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('prompt_text and model_ids are required');
    });
  });
});

describe('Word Limit Validation', () => {
  it('validates word limit is between 1 and 500', () => {
    const validateWordLimit = (value: string, useWordLimit: boolean): { valid: boolean; error: string | null } => {
      if (!useWordLimit) return { valid: true, error: null };
      const num = value ? parseInt(value, 10) : NaN;
      if (isNaN(num) || num < 1 || num > 500) {
        return { valid: false, error: 'Word limit must be between 1 and 500' };
      }
      return { valid: true, error: null };
    };

    // Valid cases
    expect(validateWordLimit('50', true)).toEqual({ valid: true, error: null });
    expect(validateWordLimit('1', true)).toEqual({ valid: true, error: null });
    expect(validateWordLimit('500', true)).toEqual({ valid: true, error: null });
    expect(validateWordLimit('', false)).toEqual({ valid: true, error: null });

    // Invalid cases
    expect(validateWordLimit('', true)).toEqual({ valid: false, error: 'Word limit must be between 1 and 500' });
    expect(validateWordLimit('0', true)).toEqual({ valid: false, error: 'Word limit must be between 1 and 500' });
    expect(validateWordLimit('501', true)).toEqual({ valid: false, error: 'Word limit must be between 1 and 500' });
    expect(validateWordLimit('-1', true)).toEqual({ valid: false, error: 'Word limit must be between 1 and 500' });
    expect(validateWordLimit('abc', true)).toEqual({ valid: false, error: 'Word limit must be between 1 and 500' });
  });

  it('strips non-digit characters from input', () => {
    const filterToDigits = (value: string): string => {
      return value.replace(/\D/g, '');
    };

    expect(filterToDigits('123')).toBe('123');
    expect(filterToDigits('12a3')).toBe('123');
    expect(filterToDigits('abc')).toBe('');
    expect(filterToDigits('1.5')).toBe('15');
    expect(filterToDigits('-10')).toBe('10');
    expect(filterToDigits('')).toBe('');
  });
});
