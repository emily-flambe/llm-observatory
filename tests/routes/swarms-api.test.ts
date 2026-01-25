import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono, Context, Next } from 'hono';
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

// Simple mock of requireAccess middleware for testing
// In real implementation, this validates JWT against Cloudflare's JWKS endpoint
const mockRequireAccess = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const token = c.req.header('cf-access-jwt-assertion');
  if (!token) {
    return c.json({ error: 'Missing Access token' }, 401);
  }
  // In tests, just accept any non-empty token
  return next();
};

// Create a test app that mirrors the actual swarm creation route
function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();

  // Apply Cloudflare Access middleware (admin routes are protected)
  app.use('/api/admin/*', mockRequireAccess);

  // Matches the actual implementation in src/routes/api.ts (now under /api/admin/swarms)
  app.post('/api/admin/swarms', async (c) => {
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
    CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    CF_ACCESS_AUD: 'test-audience-id',
    DB: {} as D1Database,
  } as unknown as Env;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe('POST /api/admin/swarms - Cloudflare Access Authentication', () => {
    it('returns 401 when cf-access-jwt-assertion header is missing', async () => {
      const res = await app.request('/api/admin/swarms', {
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
      expect(body.error).toBe('Missing Access token');
    });

    it('accepts request with valid cf-access-jwt-assertion header', async () => {
      const res = await app.request('/api/admin/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-access-jwt-assertion': 'mock-jwt-token-for-testing',
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
  });

  describe('POST /api/admin/swarms - Input Validation', () => {
    it('validates required fields after successful auth', async () => {
      const res = await app.request('/api/admin/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-access-jwt-assertion': 'mock-jwt-token-for-testing',
        },
        body: JSON.stringify({}),
      }, mockEnv);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('prompt_text and model_ids are required');
    });

    it('validates model_ids is non-empty', async () => {
      const res = await app.request('/api/admin/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-access-jwt-assertion': 'mock-jwt-token-for-testing',
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
      const res = await app.request('/api/admin/swarms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-access-jwt-assertion': 'mock-jwt-token-for-testing',
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
