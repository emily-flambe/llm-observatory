import { describe, it, expect } from 'vitest';
import { truncateToMinute } from '../../src/services/scheduler-do';

describe('Scheduler Durable Object Helpers', () => {
  describe('truncateToMinute', () => {
    it('truncates a date to minute precision', () => {
      const date = new Date('2026-01-24T15:30:45.123Z');
      const result = truncateToMinute(date);
      expect(result).toBe('2026-01-24T15:30');
    });

    it('handles midnight correctly', () => {
      const date = new Date('2026-01-24T00:00:00.000Z');
      const result = truncateToMinute(date);
      expect(result).toBe('2026-01-24T00:00');
    });

    it('handles end of day correctly', () => {
      const date = new Date('2026-01-24T23:59:59.999Z');
      const result = truncateToMinute(date);
      expect(result).toBe('2026-01-24T23:59');
    });

    it('handles year boundary correctly', () => {
      const date = new Date('2025-12-31T23:59:30.000Z');
      const result = truncateToMinute(date);
      expect(result).toBe('2025-12-31T23:59');
    });

    it('produces consistent keys for same minute', () => {
      const date1 = new Date('2026-01-24T15:30:00.000Z');
      const date2 = new Date('2026-01-24T15:30:59.999Z');
      expect(truncateToMinute(date1)).toBe(truncateToMinute(date2));
    });

    it('produces different keys for different minutes', () => {
      const date1 = new Date('2026-01-24T15:30:59.999Z');
      const date2 = new Date('2026-01-24T15:31:00.000Z');
      expect(truncateToMinute(date1)).not.toBe(truncateToMinute(date2));
    });

    it('produces sortable keys chronologically', () => {
      const earlier = truncateToMinute(new Date('2026-01-24T10:00:00.000Z'));
      const later = truncateToMinute(new Date('2026-01-24T11:00:00.000Z'));
      expect(earlier < later).toBe(true);
    });
  });
});
