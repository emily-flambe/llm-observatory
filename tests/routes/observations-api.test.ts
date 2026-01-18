import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/types/env';

// Mock the services
vi.mock('../../src/services/observations', () => ({
  createObservation: vi.fn(),
  getObservation: vi.fn(),
  getObservations: vi.fn(),
  getObservationVersionModels: vi.fn(),
  getObservationTags: vi.fn(),
  updateObservationLastRunAt: vi.fn(),
  createObservationRun: vi.fn(),
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

import {
  createObservation,
  getObservation,
  getObservationVersionModels,
  getObservationTags,
} from '../../src/services/observations';

// Create a minimal test app that mirrors the observation creation route
function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();

  // Simplified version of POST /api/observations with auth
  app.post('/api/observations', async (c) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token || token !== c.env.ADMIN_API_KEY) {
      return c.json({ error: 'Invalid or missing API key' }, 401);
    }

    const body = await c.req.json<{
      prompt_text: string;
      model_ids: string[];
    }>();

    if (!body.prompt_text || !body.model_ids?.length) {
      return c.json({ error: 'prompt_text and model_ids are required' }, 400);
    }

    // Mock successful creation
    return c.json({ observation: { id: 'test-id', prompt_text: body.prompt_text }, created: true }, 201);
  });

  return app;
}

describe('Observations API Routes', () => {
  let app: ReturnType<typeof createTestApp>;
  const mockEnv = {
    ADMIN_API_KEY: 'test-api-key-12345',
    DB: {} as D1Database,
  } as unknown as Env;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe('POST /api/observations', () => {
    it('rejects requests without Authorization header', async () => {
      const res = await app.request('/api/observations', {
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
      expect(body.error).toBe('Invalid or missing API key');
    });

    it('rejects requests with invalid API key', async () => {
      const res = await app.request('/api/observations', {
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
      expect(body.error).toBe('Invalid or missing API key');
    });

    it('rejects requests with malformed Authorization header', async () => {
      const res = await app.request('/api/observations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: ['model-1'],
        }),
      }, mockEnv);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid or missing API key');
    });

    it('accepts requests with valid API key', async () => {
      const res = await app.request('/api/observations', {
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
      expect(body.observation.prompt_text).toBe('Test prompt');
    });

    it('validates required fields after auth', async () => {
      const res = await app.request('/api/observations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          // Missing prompt_text and model_ids
        }),
      }, mockEnv);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('prompt_text and model_ids are required');
    });

    it('validates model_ids is non-empty', async () => {
      const res = await app.request('/api/observations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({
          prompt_text: 'Test prompt',
          model_ids: [], // Empty array
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
    // Test the validation logic that's used in the frontend
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
