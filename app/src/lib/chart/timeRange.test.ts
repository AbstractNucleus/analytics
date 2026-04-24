import { describe, expect, it } from 'vitest';
import { timeRangeWindow } from './timeRange';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NOW = Date.UTC(2026, 3, 23, 12, 0, 0);

describe('timeRangeWindow', () => {
  it('returns a 1h window ending at now', () => {
    const { startMs, endMs } = timeRangeWindow('1h', NOW);
    expect(endMs).toBe(NOW);
    expect(endMs - startMs).toBe(1 * HOUR);
  });

  it('returns a 24h window ending at now', () => {
    const { startMs, endMs } = timeRangeWindow('24h', NOW);
    expect(endMs).toBe(NOW);
    expect(endMs - startMs).toBe(24 * HOUR);
  });

  it('returns a 7d window ending at now', () => {
    const { startMs, endMs } = timeRangeWindow('7d', NOW);
    expect(endMs).toBe(NOW);
    expect(endMs - startMs).toBe(7 * DAY);
  });

  it('returns a 30d window ending at now', () => {
    const { startMs, endMs } = timeRangeWindow('30d', NOW);
    expect(endMs).toBe(NOW);
    expect(endMs - startMs).toBe(30 * DAY);
  });

  it('returns bucket sizes that are strictly monotonic across increasing ranges', () => {
    const b1h = timeRangeWindow('1h', NOW).bucketMs;
    const b24h = timeRangeWindow('24h', NOW).bucketMs;
    const b7d = timeRangeWindow('7d', NOW).bucketMs;
    const b30d = timeRangeWindow('30d', NOW).bucketMs;
    expect(b1h).toBeLessThan(b24h);
    expect(b24h).toBeLessThan(b7d);
    expect(b7d).toBeLessThan(b30d);
  });

  it('bucketMs divides each range into a reasonable number of buckets (30–1000)', () => {
    for (const range of ['1h', '24h', '7d', '30d'] as const) {
      const { startMs, endMs, bucketMs } = timeRangeWindow(range, NOW);
      const span = endMs - startMs;
      const buckets = span / bucketMs;
      expect(buckets).toBeGreaterThanOrEqual(30);
      expect(buckets).toBeLessThanOrEqual(1000);
    }
  });

  it('bucketMs is positive for every supported range', () => {
    for (const range of ['1h', '24h', '7d', '30d'] as const) {
      expect(timeRangeWindow(range, NOW).bucketMs).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a given now', () => {
    const a = timeRangeWindow('24h', NOW);
    const b = timeRangeWindow('24h', NOW);
    expect(a).toEqual(b);
  });

  it('defaults now to Date.now() when omitted', () => {
    const before = Date.now();
    const { endMs } = timeRangeWindow('1h');
    const after = Date.now();
    expect(endMs).toBeGreaterThanOrEqual(before);
    expect(endMs).toBeLessThanOrEqual(after);
  });
});
