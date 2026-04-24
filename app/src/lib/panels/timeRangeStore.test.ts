import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

import { range, setRange } from './timeRangeStore';

describe('timeRangeStore', () => {
  it("defaults to '24h'", () => {
    expect(get(range)).toBe('24h');
  });

  it("setRange('7d') updates subscribers", () => {
    const seen: string[] = [];
    const unsub = range.subscribe((v) => seen.push(v));

    setRange('7d');
    expect(get(range)).toBe('7d');
    expect(seen).toContain('7d');

    setRange('24h');
    unsub();
  });

  it('propagates every allowed value', () => {
    for (const v of ['1h', '24h', '7d', '30d'] as const) {
      setRange(v);
      expect(get(range)).toBe(v);
    }
    setRange('24h');
  });
});
