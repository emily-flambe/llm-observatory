import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTag, getTags, getTag, deleteTag, Tag } from '../../src/services/tags';

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
      return (mockFirst.value as T) ?? null;
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

describe('Tag Storage Functions', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe('createTag', () => {
    it('creates a tag with name only', async () => {
      const result = await createTag(mockDb, { name: 'politics' });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('politics');
      expect(result.color).toBeNull();
      expect(result.created_at).toBeDefined();
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    });

    it('creates a tag with name and color', async () => {
      const result = await createTag(mockDb, { name: 'science', color: '#3498db' });

      expect(result.name).toBe('science');
      expect(result.color).toBe('#3498db');
      expect(mockDb._getLastBoundValues()[2]).toBe('#3498db');
    });

    it('binds correct values to the INSERT statement', async () => {
      const result = await createTag(mockDb, { name: 'technology', color: '#e74c3c' });

      const boundValues = mockDb._getLastBoundValues();
      expect(boundValues[0]).toBe(result.id); // UUID
      expect(boundValues[1]).toBe('technology');
      expect(boundValues[2]).toBe('#e74c3c');
    });

    it('generates unique UUIDs for each tag', async () => {
      const result1 = await createTag(mockDb, { name: 'tag1' });
      const result2 = await createTag(mockDb, { name: 'tag2' });

      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('getTags', () => {
    it('returns empty array when no tags exist', async () => {
      mockDb._setResults([]);

      const result = await getTags(mockDb);

      expect(result).toEqual([]);
    });

    it('returns all tags ordered by name ASC', async () => {
      const mockTags: Tag[] = [
        {
          id: 'tag-1',
          name: 'arts',
          color: '#9b59b6',
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'tag-2',
          name: 'politics',
          color: null,
          created_at: '2025-01-02T00:00:00Z',
        },
        {
          id: 'tag-3',
          name: 'science',
          color: '#3498db',
          created_at: '2025-01-03T00:00:00Z',
        },
      ];
      mockDb._setResults(mockTags);

      const result = await getTags(mockDb);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('arts');
      expect(result[1].name).toBe('politics');
      expect(result[2].name).toBe('science');
    });

    it('returns tags with all properties', async () => {
      const mockTag: Tag = {
        id: 'tag-123',
        name: 'economics',
        color: '#27ae60',
        created_at: '2025-01-15T10:30:00Z',
      };
      mockDb._setResults([mockTag]);

      const result = await getTags(mockDb);

      expect(result[0]).toEqual(mockTag);
    });
  });

  describe('getTag', () => {
    it('returns null when tag not found', async () => {
      mockDb._setFirst(null);

      const result = await getTag(mockDb, 'non-existent-id');

      expect(result).toBeNull();
    });

    it('returns tag when found', async () => {
      const mockTag: Tag = {
        id: 'tag-123',
        name: 'health',
        color: '#e67e22',
        created_at: '2025-01-10T08:00:00Z',
      };
      mockDb._setFirst(mockTag);

      const result = await getTag(mockDb, 'tag-123');

      expect(result).toEqual(mockTag);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('tag-123');
    });

    it('returns tag with null color', async () => {
      const mockTag: Tag = {
        id: 'tag-456',
        name: 'sports',
        color: null,
        created_at: '2025-01-12T14:00:00Z',
      };
      mockDb._setFirst(mockTag);

      const result = await getTag(mockDb, 'tag-456');

      expect(result?.color).toBeNull();
    });
  });

  describe('deleteTag', () => {
    it('returns true when tag deleted', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });

      const result = await deleteTag(mockDb, 'tag-123');

      expect(result).toBe(true);
      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('tag-123');
    });

    it('returns false when tag not found', async () => {
      mockDb._mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });

      const result = await deleteTag(mockDb, 'non-existent-id');

      expect(result).toBe(false);
    });

    it('calls DELETE with correct id', async () => {
      await deleteTag(mockDb, 'tag-to-delete');

      expect(mockDb._mockStatement.bind).toHaveBeenCalledWith('tag-to-delete');
      expect(mockDb._mockStatement.run).toHaveBeenCalled();
    });
  });
});
