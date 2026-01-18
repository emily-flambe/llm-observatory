import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createObservation,
  getObservation,
  getObservations,
  getObservationVersionModels,
  getObservationTags,
  getObservationVersions,
  updateObservation,
  deleteObservation,
  restoreObservation,
  updateObservationLastRunAt,
} from '../../src/services/observations';

// Helper to create mock D1 database
function createMockDb() {
  const mockResults: Record<string, unknown> = {};
  const mockFirst: Record<string, unknown> = {};
  let lastBoundValues: unknown[] = [];
  let prepareCallCount = 0;

  const mockStatement = {
    bind: vi.fn((...args: unknown[]) => {
      lastBoundValues = args;
      return mockStatement;
    }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn(async <T>(): Promise<T | null> => {
      return (mockFirst.value as T) ?? null;
    }),
    all: vi.fn(async <T>(): Promise<{ results: T[] }> => {
      return { results: (mockResults.value as T[]) ?? [] };
    }),
  };

  const db = {
    prepare: vi.fn(() => {
      prepareCallCount++;
      return mockStatement;
    }),
    _mockStatement: mockStatement,
    _setResults: (value: unknown[]) => {
      mockResults.value = value;
    },
    _setFirst: (value: unknown) => {
      mockFirst.value = value;
    },
    _getLastBoundValues: () => lastBoundValues,
    _getPrepareCallCount: () => prepareCallCount,
    _resetPrepareCallCount: () => {
      prepareCallCount = 0;
    },
  };

  return db as unknown as D1Database & typeof db;
}

describe('Observation Storage Functions', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe('createObservation', () => {
    it('creates an observation with required fields', async () => {
      const input = {
        prompt_text: 'Test prompt about something',
        model_ids: ['model-1', 'model-2'],
      };

      const result = await createObservation(mockDb, input);

      expect(result.observation).toBeDefined();
      expect(result.observation.prompt_text).toBe('Test prompt about something');
      expect(result.observation.display_name).toBeNull();
      expect(result.observation.disabled).toBe(0);
      expect(result.observation.id).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.version.version).toBe(1);
      expect(result.version.schedule_type).toBeNull();
      expect(result.version.is_paused).toBe(0);
    });

    it('creates an observation with optional display_name', async () => {
      const input = {
        prompt_text: 'Test prompt',
        display_name: 'My Custom Observation',
        model_ids: ['model-1'],
      };

      const result = await createObservation(mockDb, input);

      expect(result.observation.display_name).toBe('My Custom Observation');
    });

    it('creates an observation with schedule', async () => {
      const input = {
        prompt_text: 'Test prompt',
        model_ids: ['model-1'],
        schedule_type: 'daily' as const,
        cron_expression: '0 6 * * *',
      };

      const result = await createObservation(mockDb, input);

      expect(result.version.schedule_type).toBe('daily');
      expect(result.version.cron_expression).toBe('0 6 * * *');
    });

    it('inserts models into observation_version_models', async () => {
      const input = {
        prompt_text: 'Test prompt',
        model_ids: ['model-1', 'model-2', 'model-3'],
      };

      mockDb._resetPrepareCallCount();
      await createObservation(mockDb, input);

      // Should call prepare for: observation insert, version insert, and 3 model inserts
      expect(mockDb._getPrepareCallCount()).toBe(5);
    });

    it('creates an observation with tags', async () => {
      const input = {
        prompt_text: 'Test prompt',
        model_ids: ['model-1'],
        tag_ids: ['tag-1', 'tag-2'],
      };

      mockDb._resetPrepareCallCount();
      await createObservation(mockDb, input);

      // Should call prepare for: observation insert, version insert, 1 model insert, and 2 tag inserts
      expect(mockDb._getPrepareCallCount()).toBe(5);
    });
  });

  describe('getObservation', () => {
    it('returns null when observation not found', async () => {
      mockDb._setFirst(null);

      const result = await getObservation(mockDb, 'non-existent-id');

      expect(result).toBeNull();
    });

    it('returns observation with details when found', async () => {
      const mockObservation = {
        id: 'observation-123',
        prompt_text: 'Test prompt',
        display_name: null,
        disabled: 0,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
        current_version: 1,
        schedule_type: null,
        cron_expression: null,
        is_paused: 0,
        model_count: 3,
      };
      mockDb._setFirst(mockObservation);

      const result = await getObservation(mockDb, 'observation-123');

      expect(result).toEqual(mockObservation);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('observation-123');
    });

    it('returns observation with schedule details', async () => {
      const mockObservation = {
        id: 'observation-123',
        prompt_text: 'Scheduled prompt',
        display_name: 'Daily Check',
        disabled: 0,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: '2025-01-02T06:00:00Z',
        current_version: 2,
        schedule_type: 'daily',
        cron_expression: '0 6 * * *',
        is_paused: 0,
        model_count: 5,
      };
      mockDb._setFirst(mockObservation);

      const result = await getObservation(mockDb, 'observation-123');

      expect(result?.schedule_type).toBe('daily');
      expect(result?.cron_expression).toBe('0 6 * * *');
      expect(result?.current_version).toBe(2);
    });
  });

  describe('getObservations', () => {
    it('returns empty array when no observations exist', async () => {
      mockDb._setResults([]);

      const result = await getObservations(mockDb);

      expect(result).toEqual([]);
    });

    it('returns all observations ordered by created_at DESC', async () => {
      const mockObservations = [
        {
          id: 'observation-2',
          prompt_text: 'Prompt 2',
          display_name: null,
          disabled: 0,
          created_at: '2025-01-02T00:00:00Z',
          last_run_at: null,
          current_version: 1,
          schedule_type: 'daily',
          cron_expression: '0 6 * * *',
          is_paused: 0,
          model_count: 2,
        },
        {
          id: 'observation-1',
          prompt_text: 'Prompt 1',
          display_name: 'Custom Name',
          disabled: 0,
          created_at: '2025-01-01T00:00:00Z',
          last_run_at: '2025-01-01T12:00:00Z',
          current_version: 2,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          model_count: 5,
        },
      ];
      mockDb._setResults(mockObservations);

      const result = await getObservations(mockDb);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('observation-2');
      expect(result[1].id).toBe('observation-1');
    });

    it('excludes disabled observations when includeDisabled is false', async () => {
      const mockObservations = [
        {
          id: 'observation-1',
          prompt_text: 'Active prompt',
          display_name: null,
          disabled: 0,
          created_at: '2025-01-01T00:00:00Z',
          last_run_at: null,
          current_version: 1,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          model_count: 2,
        },
      ];
      mockDb._setResults(mockObservations);

      const result = await getObservations(mockDb, { includeDisabled: false });

      expect(result).toHaveLength(1);
      expect(result[0].disabled).toBe(0);
    });

    it('includes disabled observations by default', async () => {
      const mockObservations = [
        {
          id: 'observation-1',
          prompt_text: 'Active prompt',
          display_name: null,
          disabled: 0,
          created_at: '2025-01-01T00:00:00Z',
          last_run_at: null,
          current_version: 1,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          model_count: 2,
        },
        {
          id: 'observation-2',
          prompt_text: 'Disabled prompt',
          display_name: null,
          disabled: 1,
          created_at: '2025-01-02T00:00:00Z',
          last_run_at: null,
          current_version: 1,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          model_count: 1,
        },
      ];
      mockDb._setResults(mockObservations);

      const result = await getObservations(mockDb);

      expect(result).toHaveLength(2);
    });
  });

  describe('getObservationVersionModels', () => {
    it('returns empty array when no models', async () => {
      mockDb._setResults([]);

      const result = await getObservationVersionModels(mockDb, 'observation-123');

      expect(result).toEqual([]);
    });

    it('returns model IDs for observation', async () => {
      mockDb._setResults([
        { model_id: 'model-1' },
        { model_id: 'model-2' },
        { model_id: 'model-3' },
      ]);

      const result = await getObservationVersionModels(mockDb, 'observation-123');

      expect(result).toEqual(['model-1', 'model-2', 'model-3']);
    });
  });

  describe('getObservationTags', () => {
    it('returns empty array when no tags', async () => {
      mockDb._setResults([]);

      const result = await getObservationTags(mockDb, 'observation-123');

      expect(result).toEqual([]);
    });

    it('returns tags for observation', async () => {
      mockDb._setResults([
        { id: 'tag-1', name: 'Politics', color: '#ff0000' },
        { id: 'tag-2', name: 'Science', color: '#00ff00' },
      ]);

      const result = await getObservationTags(mockDb, 'observation-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'tag-1', name: 'Politics', color: '#ff0000' });
      expect(result[1]).toEqual({ id: 'tag-2', name: 'Science', color: '#00ff00' });
    });
  });

  describe('getObservationVersions', () => {
    it('returns empty array when no versions', async () => {
      mockDb._setResults([]);

      const result = await getObservationVersions(mockDb, 'observation-123');

      expect(result).toEqual([]);
    });

    it('returns versions ordered by version DESC', async () => {
      const mockVersions = [
        {
          id: 'version-2',
          observation_id: 'observation-123',
          version: 2,
          schedule_type: 'daily',
          cron_expression: '0 6 * * *',
          is_paused: 0,
          created_at: '2025-01-02T00:00:00Z',
        },
        {
          id: 'version-1',
          observation_id: 'observation-123',
          version: 1,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockDb._setResults(mockVersions);

      const result = await getObservationVersions(mockDb, 'observation-123');

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });
  });

  describe('updateObservation', () => {
    it('returns null observation when observation not found', async () => {
      mockDb._setFirst(null);

      const result = await updateObservation(mockDb, 'non-existent', {
        display_name: 'New Name',
      });

      expect(result.observation).toBeNull();
      expect(result.new_version).toBe(false);
    });

    it('updates display_name without creating new version', async () => {
      const mockObservation = {
        id: 'observation-123',
        prompt_text: 'Test prompt',
        display_name: 'Old Name',
        disabled: 0,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
        current_version: 1,
        schedule_type: null,
        cron_expression: null,
        is_paused: 0,
        model_count: 2,
      };

      // First call returns the observation, subsequent calls also return it
      mockDb._setFirst(mockObservation);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateObservation(mockDb, 'observation-123', {
        display_name: 'New Name',
      });

      // Should not create new version for just display_name change
      expect(result.new_version).toBe(false);
    });

    it('creates new version when models change', async () => {
      const mockObservation = {
        id: 'observation-123',
        prompt_text: 'Test prompt',
        display_name: null,
        disabled: 0,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
        current_version: 1,
        schedule_type: null,
        cron_expression: null,
        is_paused: 0,
        model_count: 2,
      };

      mockDb._setFirst(mockObservation);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateObservation(mockDb, 'observation-123', {
        model_ids: ['model-1', 'model-3'], // Changed models
      });

      expect(result.new_version).toBe(true);
    });

    it('creates new version when schedule changes', async () => {
      const mockObservation = {
        id: 'observation-123',
        prompt_text: 'Test prompt',
        display_name: null,
        disabled: 0,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
        current_version: 1,
        schedule_type: null,
        cron_expression: null,
        is_paused: 0,
        model_count: 2,
      };

      mockDb._setFirst(mockObservation);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateObservation(mockDb, 'observation-123', {
        schedule_type: 'daily',
        cron_expression: '0 6 * * *',
      });

      expect(result.new_version).toBe(true);
    });

    it('does not create new version when only tags change', async () => {
      const mockObservation = {
        id: 'observation-123',
        prompt_text: 'Test prompt',
        display_name: null,
        disabled: 0,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
        current_version: 1,
        schedule_type: null,
        cron_expression: null,
        is_paused: 0,
        model_count: 2,
      };

      mockDb._setFirst(mockObservation);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateObservation(mockDb, 'observation-123', {
        tag_ids: ['tag-1', 'tag-2'],
      });

      // Tags should NOT create a new version
      expect(result.new_version).toBe(false);
    });
  });

  describe('deleteObservation', () => {
    it('returns true when observation deleted (soft delete)', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await deleteObservation(mockDb, 'observation-123');

      expect(result).toBe(true);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('observation-123');
    });

    it('returns false when observation not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await deleteObservation(mockDb, 'non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('restoreObservation', () => {
    it('returns true when observation restored', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await restoreObservation(mockDb, 'observation-123');

      expect(result).toBe(true);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('observation-123');
    });

    it('returns false when observation not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await restoreObservation(mockDb, 'non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('updateObservationLastRunAt', () => {
    it('updates last_run_at timestamp', async () => {
      await updateObservationLastRunAt(mockDb, 'observation-123');

      expect(mockDb.prepare).toHaveBeenCalled();
      const boundValues = mockDb._getLastBoundValues();
      expect(boundValues[1]).toBe('observation-123');
      // First value should be an ISO timestamp
      expect(typeof boundValues[0]).toBe('string');
      expect((boundValues[0] as string).match(/^\d{4}-\d{2}-\d{2}T/)).toBeTruthy();
    });
  });
});
