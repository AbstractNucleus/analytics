import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { tweenNumber } from './tween';

/**
 * Collect every value pushed to a readable store across the tween's duration.
 *
 * We drive `requestAnimationFrame` manually via fake timers so the test is
 * deterministic and doesn't wait on real wall-clock time. The jsdom-safe rAF
 * fallback implemented in tween.ts wires through setTimeout, so advancing
 * timers replays the animation in full.
 */
function collectTween(store: ReturnType<typeof tweenNumber>, totalMs: number): number[] {
  const values: number[] = [];
  const unsubscribe = store.subscribe((v) => values.push(v));
  vi.advanceTimersByTime(totalMs + 100);
  unsubscribe();
  return values;
}

describe('tweenNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the from value immediately', () => {
    const store = tweenNumber(10, 50, 400);
    expect(get(store)).toBe(10);
  });

  it('lands exactly on the to value at duration end', () => {
    const store = tweenNumber(0, 100, 400);
    collectTween(store, 400);
    expect(get(store)).toBe(100);
  });

  it('produces monotonically non-decreasing samples when going up', () => {
    const store = tweenNumber(0, 100, 400);
    const values = collectTween(store, 400);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('produces monotonically non-increasing samples when going down', () => {
    const store = tweenNumber(100, 0, 400);
    const values = collectTween(store, 400);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
  });

  it('stays pinned at from when from equals to', () => {
    const store = tweenNumber(42, 42, 400);
    const values = collectTween(store, 400);
    for (const v of values) expect(v).toBe(42);
    expect(get(store)).toBe(42);
  });

  it('produces intermediate samples strictly between from and to', () => {
    const store = tweenNumber(0, 100, 400);
    const values = collectTween(store, 400);
    // At least one sample should land between the endpoints.
    const mids = values.filter((v) => v > 0 && v < 100);
    expect(mids.length).toBeGreaterThan(0);
  });

  it('defaults duration to 400ms', () => {
    const store = tweenNumber(0, 10);
    collectTween(store, 400);
    expect(get(store)).toBe(10);
  });
});
