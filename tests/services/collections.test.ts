import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCollection,
  getCollection,
  getCollections,
  getCollectionByTopicAndTemplate,
  getCollectionVersionModels,
  getCollectionVersions,
  updateCollection,
  deleteCollection,
  updateCollectionLastRunAt,
} from '../../src/services/storage';

// Helper to create mock D1 database
function createMockDb() {
  const mockResults: Record<string, unknown> = {};
  const mockFirst: Record<string, unknown> = {};
  let lastBoundValues: unknown[] = [];

  const mockStatement = {
    bind: vi.fn((...args: unknown[]) => {
      lastBoundValues = args;
      return mockStatement;
    }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn(async <T>(): Promise<T | null> => {
      return mockFirst.value as T ?? null;
    }),
    all: vi.fn(async <T>(): Promise<{ results: T[] }> => {
      return { results: (mockResults.value as T[]) ?? [] };
    }),
  };

  const db = {
    prepare: vi.fn(() => mockStatement),
    _mockStatement: mockStatement,
    _setResults: (value: unknown[]) => {
      mockResults.value = value;
    },
    _setFirst: (value: unknown) => {
      mockFirst.value = value;
    },
    _getLastBoundValues: () => lastBoundValues,
  };

  return db as unknown as D1Database & typeof db;
}

describe('Collection Storage Functions', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe('createCollection', () => {
    it('creates a collection with required fields', async () => {
      const input = {
        topic_id: 'test-topic',
        template_id: 'test-template',
        prompt_text: 'Test prompt about {topic}',
        model_ids: ['model-1', 'model-2'],
      };

      const result = await createCollection(mockDb, input);

      expect(result.collection).toBeDefined();
      expect(result.collection.topic_id).toBe('test-topic');
      expect(result.collection.template_id).toBe('test-template');
      expect(result.collection.prompt_text).toBe('Test prompt about {topic}');
      expect(result.collection.display_name).toBeNull();
      expect(result.collection.id).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.version.version).toBe(1);
      expect(result.version.schedule_type).toBeNull();
    });

    it('creates a collection with optional display_name', async () => {
      const input = {
        topic_id: 'test-topic',
        template_id: 'test-template',
        prompt_text: 'Test prompt',
        display_name: 'My Custom Collection',
        model_ids: ['model-1'],
      };

      const result = await createCollection(mockDb, input);

      expect(result.collection.display_name).toBe('My Custom Collection');
    });

    it('inserts models into collection_version_models', async () => {
      const input = {
        topic_id: 'test-topic',
        template_id: 'test-template',
        prompt_text: 'Test prompt',
        model_ids: ['model-1', 'model-2', 'model-3'],
      };

      await createCollection(mockDb, input);

      // Should call prepare for: collection insert, version insert, and 3 model inserts
      expect(mockDb.prepare).toHaveBeenCalledTimes(5);
    });
  });

  describe('getCollection', () => {
    it('returns null when collection not found', async () => {
      mockDb._setFirst(null);

      const result = await getCollection(mockDb, 'non-existent-id');

      expect(result).toBeNull();
    });

    it('returns collection with details when found', async () => {
      const mockCollection = {
        id: 'collection-123',
        topic_id: 'topic-1',
        template_id: 'template-1',
        prompt_text: 'Test prompt',
        display_name: null,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
        topic_name: 'Test Topic',
        template_name: 'Test Template',
        current_version: 1,
        schedule_type: null,
        cron_expression: null,
        is_paused: 0,
        model_count: 3,
      };
      mockDb._setFirst(mockCollection);

      const result = await getCollection(mockDb, 'collection-123');

      expect(result).toEqual(mockCollection);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('collection-123');
    });
  });

  describe('getCollections', () => {
    it('returns empty array when no collections exist', async () => {
      mockDb._setResults([]);

      const result = await getCollections(mockDb);

      expect(result).toEqual([]);
    });

    it('returns all collections ordered by created_at DESC', async () => {
      const mockCollections = [
        {
          id: 'collection-2',
          topic_id: 'topic-2',
          template_id: 'template-2',
          prompt_text: 'Prompt 2',
          display_name: null,
          created_at: '2025-01-02T00:00:00Z',
          last_run_at: null,
          topic_name: 'Topic 2',
          template_name: 'Template 2',
          current_version: 1,
          schedule_type: 'daily',
          cron_expression: '0 6 * * *',
          is_paused: 0,
          model_count: 2,
        },
        {
          id: 'collection-1',
          topic_id: 'topic-1',
          template_id: 'template-1',
          prompt_text: 'Prompt 1',
          display_name: 'Custom Name',
          created_at: '2025-01-01T00:00:00Z',
          last_run_at: '2025-01-01T12:00:00Z',
          topic_name: 'Topic 1',
          template_name: 'Template 1',
          current_version: 2,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          model_count: 5,
        },
      ];
      mockDb._setResults(mockCollections);

      const result = await getCollections(mockDb);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('collection-2');
      expect(result[1].id).toBe('collection-1');
    });
  });

  describe('getCollectionByTopicAndTemplate', () => {
    it('returns null when no matching collection exists', async () => {
      mockDb._setFirst(null);

      const result = await getCollectionByTopicAndTemplate(
        mockDb,
        'topic-1',
        'template-1'
      );

      expect(result).toBeNull();
    });

    it('returns collection when topic and template match', async () => {
      const mockCollection = {
        id: 'collection-123',
        topic_id: 'topic-1',
        template_id: 'template-1',
        prompt_text: 'Test prompt',
        display_name: null,
        created_at: '2025-01-01T00:00:00Z',
        last_run_at: null,
      };
      mockDb._setFirst(mockCollection);

      const result = await getCollectionByTopicAndTemplate(
        mockDb,
        'topic-1',
        'template-1'
      );

      expect(result).toEqual(mockCollection);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('topic-1', 'template-1');
    });
  });

  describe('getCollectionVersionModels', () => {
    it('returns empty array when no models', async () => {
      mockDb._setResults([]);

      const result = await getCollectionVersionModels(mockDb, 'collection-123');

      expect(result).toEqual([]);
    });

    it('returns model IDs for collection', async () => {
      mockDb._setResults([
        { model_id: 'model-1' },
        { model_id: 'model-2' },
        { model_id: 'model-3' },
      ]);

      const result = await getCollectionVersionModels(mockDb, 'collection-123');

      expect(result).toEqual(['model-1', 'model-2', 'model-3']);
    });
  });

  describe('getCollectionVersions', () => {
    it('returns empty array when no versions', async () => {
      mockDb._setResults([]);

      const result = await getCollectionVersions(mockDb, 'collection-123');

      expect(result).toEqual([]);
    });

    it('returns versions ordered by version DESC', async () => {
      const mockVersions = [
        {
          id: 'version-2',
          collection_id: 'collection-123',
          version: 2,
          schedule_type: 'daily',
          cron_expression: '0 6 * * *',
          is_paused: 0,
          created_at: '2025-01-02T00:00:00Z',
        },
        {
          id: 'version-1',
          collection_id: 'collection-123',
          version: 1,
          schedule_type: null,
          cron_expression: null,
          is_paused: 0,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];
      mockDb._setResults(mockVersions);

      const result = await getCollectionVersions(mockDb, 'collection-123');

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });
  });

  describe('deleteCollection', () => {
    it('returns true when collection deleted', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await deleteCollection(mockDb, 'collection-123');

      expect(result).toBe(true);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('collection-123');
    });

    it('returns false when collection not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await deleteCollection(mockDb, 'non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('updateCollectionLastRunAt', () => {
    it('updates last_run_at timestamp', async () => {
      await updateCollectionLastRunAt(mockDb, 'collection-123');

      expect(mockDb.prepare).toHaveBeenCalled();
      const boundValues = mockDb._getLastBoundValues();
      expect(boundValues[1]).toBe('collection-123');
      // First value should be an ISO timestamp
      expect(typeof boundValues[0]).toBe('string');
      expect((boundValues[0] as string).match(/^\d{4}-\d{2}-\d{2}T/)).toBeTruthy();
    });
  });
});

describe('updateCollection', () => {
  it('returns null collection when collection not found', async () => {
    const mockDb = createMockDb();
    mockDb._setFirst(null);

    const result = await updateCollection(mockDb, 'non-existent', {
      display_name: 'New Name',
    });

    expect(result.collection).toBeNull();
    expect(result.new_version).toBe(false);
  });
});
