import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSwarm,
  getSwarm,
  getSwarms,
  getSwarmVersionModels,
  getSwarmTags,
  getSwarmVersions,
  updateSwarm,
  deleteSwarm,
  restoreSwarm,
  updateSwarmLastRunAt,
} from '../../src/services/swarms';

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

describe('Swarm Storage Functions', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe('createSwarm', () => {
    it('creates a swarm with required fields', async () => {
      const input = {
        prompt_text: 'Test prompt about something',
        model_ids: ['model-1', 'model-2'],
      };

      const result = await createSwarm(mockDb, input);

      expect(result.swarm).toBeDefined();
      expect(result.swarm.prompt_text).toBe('Test prompt about something');
      expect(result.swarm.display_name).toBeNull();
      expect(result.swarm.disabled).toBe(0);
      expect(result.swarm.id).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.version.version).toBe(1);
      expect(result.version.schedule_type).toBeNull();
      expect(result.version.is_paused).toBe(0);
    });

    it('creates a swarm with optional display_name', async () => {
      const input = {
        prompt_text: 'Test prompt',
        display_name: 'My Custom Swarm',
        model_ids: ['model-1'],
      };

      const result = await createSwarm(mockDb, input);

      expect(result.swarm.display_name).toBe('My Custom Swarm');
    });

    it('creates a swarm with schedule', async () => {
      const input = {
        prompt_text: 'Test prompt',
        model_ids: ['model-1'],
        schedule_type: 'daily' as const,
        cron_expression: '0 6 * * *',
      };

      const result = await createSwarm(mockDb, input);

      expect(result.version.schedule_type).toBe('daily');
      expect(result.version.cron_expression).toBe('0 6 * * *');
    });

    it('inserts models into swarm_version_models', async () => {
      const input = {
        prompt_text: 'Test prompt',
        model_ids: ['model-1', 'model-2', 'model-3'],
      };

      mockDb._resetPrepareCallCount();
      await createSwarm(mockDb, input);

      // Should call prepare for: swarm insert, version insert, and 3 model inserts
      expect(mockDb._getPrepareCallCount()).toBe(5);
    });

    it('creates a swarm with tags', async () => {
      const input = {
        prompt_text: 'Test prompt',
        model_ids: ['model-1'],
        tag_ids: ['tag-1', 'tag-2'],
      };

      mockDb._resetPrepareCallCount();
      await createSwarm(mockDb, input);

      // Should call prepare for: swarm insert, version insert, 1 model insert, and 2 tag inserts
      expect(mockDb._getPrepareCallCount()).toBe(5);
    });
  });

  describe('getSwarm', () => {
    it('returns null when swarm not found', async () => {
      mockDb._setFirst(null);

      const result = await getSwarm(mockDb, 'non-existent-id');

      expect(result).toBeNull();
    });

    it('returns swarm with details when found', async () => {
      const mockSwarm = {
        id: 'swarm-123',
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
      mockDb._setFirst(mockSwarm);

      const result = await getSwarm(mockDb, 'swarm-123');

      expect(result).toEqual(mockSwarm);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('swarm-123');
    });

    it('returns swarm with schedule details', async () => {
      const mockSwarm = {
        id: 'swarm-123',
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
      mockDb._setFirst(mockSwarm);

      const result = await getSwarm(mockDb, 'swarm-123');

      expect(result?.schedule_type).toBe('daily');
      expect(result?.cron_expression).toBe('0 6 * * *');
      expect(result?.current_version).toBe(2);
    });
  });

  describe('getSwarms', () => {
    it('returns empty array when no swarms exist', async () => {
      mockDb._setResults([]);

      const result = await getSwarms(mockDb);

      expect(result).toEqual([]);
    });

    it('returns all swarms ordered by created_at DESC', async () => {
      const mockSwarms = [
        {
          id: 'swarm-2',
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
          id: 'swarm-1',
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
      mockDb._setResults(mockSwarms);

      const result = await getSwarms(mockDb);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('swarm-2');
      expect(result[1].id).toBe('swarm-1');
    });

    it('excludes disabled swarms when includeDisabled is false', async () => {
      const mockSwarms = [
        {
          id: 'swarm-1',
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
      mockDb._setResults(mockSwarms);

      const result = await getSwarms(mockDb, { includeDisabled: false });

      expect(result).toHaveLength(1);
      expect(result[0].disabled).toBe(0);
    });

    it('includes disabled swarms by default', async () => {
      const mockSwarms = [
        {
          id: 'swarm-1',
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
          id: 'swarm-2',
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
      mockDb._setResults(mockSwarms);

      const result = await getSwarms(mockDb);

      expect(result).toHaveLength(2);
    });
  });

  describe('getSwarmVersionModels', () => {
    it('returns empty array when no models', async () => {
      mockDb._setResults([]);

      const result = await getSwarmVersionModels(mockDb, 'swarm-123');

      expect(result).toEqual([]);
    });

    it('returns model IDs for swarm', async () => {
      mockDb._setResults([
        { model_id: 'model-1' },
        { model_id: 'model-2' },
        { model_id: 'model-3' },
      ]);

      const result = await getSwarmVersionModels(mockDb, 'swarm-123');

      expect(result).toEqual(['model-1', 'model-2', 'model-3']);
    });
  });

  describe('getSwarmTags', () => {
    it('returns empty array when no tags', async () => {
      mockDb._setResults([]);

      const result = await getSwarmTags(mockDb, 'swarm-123');

      expect(result).toEqual([]);
    });

    it('returns tags for swarm', async () => {
      mockDb._setResults([
        { id: 'tag-1', name: 'Politics', color: '#ff0000' },
        { id: 'tag-2', name: 'Science', color: '#00ff00' },
      ]);

      const result = await getSwarmTags(mockDb, 'swarm-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'tag-1', name: 'Politics', color: '#ff0000' });
      expect(result[1]).toEqual({ id: 'tag-2', name: 'Science', color: '#00ff00' });
    });
  });

  describe('getSwarmVersions', () => {
    it('returns empty array when no versions', async () => {
      mockDb._setResults([]);

      const result = await getSwarmVersions(mockDb, 'swarm-123');

      expect(result).toEqual([]);
    });

    it('returns versions ordered by version DESC', async () => {
      const mockVersions = [
        {
          id: 'version-2',
          swarm_id: 'swarm-123',
          version: 2,
          schedule_type: 'daily',
          cron_expression: '0 6 * * *',
          is_paused: 0,
          created_at: '2025-01-02T00:00:00Z',
        },
        {
          id: 'version-1',
          swarm_id: 'swarm-123',
          version: 1,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockDb._setResults(mockVersions);

      const result = await getSwarmVersions(mockDb, 'swarm-123');

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });
  });

  describe('updateSwarm', () => {
    it('returns null swarm when swarm not found', async () => {
      mockDb._setFirst(null);

      const result = await updateSwarm(mockDb, 'non-existent', {
        display_name: 'New Name',
      });

      expect(result.swarm).toBeNull();
      expect(result.new_version).toBe(false);
    });

    it('updates display_name without creating new version', async () => {
      const mockSwarm = {
        id: 'swarm-123',
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

      // First call returns the swarm, subsequent calls also return it
      mockDb._setFirst(mockSwarm);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateSwarm(mockDb, 'swarm-123', {
        display_name: 'New Name',
      });

      // Should not create new version for just display_name change
      expect(result.new_version).toBe(false);
    });

    it('creates new version when models change', async () => {
      const mockSwarm = {
        id: 'swarm-123',
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

      mockDb._setFirst(mockSwarm);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateSwarm(mockDb, 'swarm-123', {
        model_ids: ['model-1', 'model-3'], // Changed models
      });

      expect(result.new_version).toBe(true);
    });

    it('creates new version when schedule changes', async () => {
      const mockSwarm = {
        id: 'swarm-123',
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

      mockDb._setFirst(mockSwarm);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateSwarm(mockDb, 'swarm-123', {
        schedule_type: 'daily',
        cron_expression: '0 6 * * *',
      });

      expect(result.new_version).toBe(true);
    });

    it('does not create new version when only tags change', async () => {
      const mockSwarm = {
        id: 'swarm-123',
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

      mockDb._setFirst(mockSwarm);
      mockDb._setResults([{ model_id: 'model-1' }, { model_id: 'model-2' }]);

      const result = await updateSwarm(mockDb, 'swarm-123', {
        tag_ids: ['tag-1', 'tag-2'],
      });

      // Tags should NOT create a new version
      expect(result.new_version).toBe(false);
    });
  });

  describe('deleteSwarm', () => {
    it('returns true when swarm deleted (soft delete)', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await deleteSwarm(mockDb, 'swarm-123');

      expect(result).toBe(true);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('swarm-123');
    });

    it('returns false when swarm not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await deleteSwarm(mockDb, 'non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('restoreSwarm', () => {
    it('returns true when swarm restored', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await restoreSwarm(mockDb, 'swarm-123');

      expect(result).toBe(true);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('swarm-123');
    });

    it('returns false when swarm not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await restoreSwarm(mockDb, 'non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('updateSwarmLastRunAt', () => {
    it('updates last_run_at timestamp', async () => {
      await updateSwarmLastRunAt(mockDb, 'swarm-123');

      expect(mockDb.prepare).toHaveBeenCalled();
      const boundValues = mockDb._getLastBoundValues();
      expect(boundValues[1]).toBe('swarm-123');
      // First value should be an ISO timestamp
      expect(typeof boundValues[0]).toBe('string');
      expect((boundValues[0] as string).match(/^\d{4}-\d{2}-\d{2}T/)).toBeTruthy();
    });
  });
});
