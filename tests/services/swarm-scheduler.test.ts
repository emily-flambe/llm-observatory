import { describe, it, expect } from 'vitest';
import { alreadyRanInCurrentMinute } from '../../src/services/swarm-scheduler';

describe('Swarm Scheduler Idempotency', () => {
  describe('alreadyRanInCurrentMinute', () => {
    it('returns false when lastRunAt is null', () => {
      const scheduledTime = new Date('2026-01-19T17:25:00.000Z');
      const result = alreadyRanInCurrentMinute(null, scheduledTime);
      expect(result).toBe(false);
    });

    it('returns true when lastRunAt matches the same minute', () => {
      const lastRunAt = '2026-01-19T17:25:00.000Z';
      const scheduledTime = new Date('2026-01-19T17:25:30.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(true);
    });

    it('returns true when lastRunAt matches exactly', () => {
      const lastRunAt = '2026-01-19T17:25:00.000Z';
      const scheduledTime = new Date('2026-01-19T17:25:00.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(true);
    });

    it('returns false when lastRunAt is from previous minute', () => {
      const lastRunAt = '2026-01-19T17:24:00.000Z';
      const scheduledTime = new Date('2026-01-19T17:25:00.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(false);
    });

    it('returns false when lastRunAt is from next minute', () => {
      const lastRunAt = '2026-01-19T17:26:00.000Z';
      const scheduledTime = new Date('2026-01-19T17:25:00.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(false);
    });

    it('returns false when lastRunAt is from different hour', () => {
      const lastRunAt = '2026-01-19T16:25:00.000Z';
      const scheduledTime = new Date('2026-01-19T17:25:00.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(false);
    });

    it('returns false when lastRunAt is from different day', () => {
      const lastRunAt = '2026-01-18T17:25:00.000Z';
      const scheduledTime = new Date('2026-01-19T17:25:00.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(false);
    });

    it('handles midnight boundary correctly', () => {
      // 23:59 on one day and 00:00 on next day should be different
      const lastRunAt = '2026-01-19T23:59:00.000Z';
      const scheduledTime = new Date('2026-01-20T00:00:00.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(false);
    });

    it('handles year boundary correctly', () => {
      const lastRunAt = '2025-12-31T23:59:00.000Z';
      const scheduledTime = new Date('2026-01-01T00:00:00.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(false);
    });

    it('ignores seconds difference within same minute', () => {
      const lastRunAt = '2026-01-19T17:25:15.000Z';
      const scheduledTime = new Date('2026-01-19T17:25:45.000Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(true);
    });

    it('ignores milliseconds difference within same minute', () => {
      const lastRunAt = '2026-01-19T17:25:00.123Z';
      const scheduledTime = new Date('2026-01-19T17:25:00.456Z');
      const result = alreadyRanInCurrentMinute(lastRunAt, scheduledTime);
      expect(result).toBe(true);
    });
  });
});
