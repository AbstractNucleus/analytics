import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';

// uPlot needs a canvas, which jsdom doesn't provide, so stub the default export
// with a constructor that records how it's called. Tests then assert on the
// options handed to uPlot and on the reactive setData calls — no real plotting.
const uplotCalls: Array<{ opts: unknown; data: unknown; target: unknown }> = [];
const setDataCalls: unknown[][] = [];
const destroyCalls: number[] = [];

vi.mock('uplot', () => {
  class MockUplot {
    opts: unknown;
    data: unknown;
    target: unknown;
    constructor(opts: unknown, data: unknown, target: unknown) {
      this.opts = opts;
      this.data = data;
      this.target = target;
      uplotCalls.push({ opts, data, target });
    }
    setData(data: unknown) {
      setDataCalls.push([data]);
    }
    destroy() {
      destroyCalls.push(Date.now());
    }
  }
  return { default: MockUplot };
});

import TimeSeries from './TimeSeries.svelte';

const SERIES = [
  {},
  { label: 'A', stroke: 'red' },
  { label: 'B', stroke: 'blue' }
];

const DATA_A: [number[], number[], number[]] = [
  [1, 2, 3],
  [10, 20, 30],
  [5, 15, 25]
];

const DATA_B: [number[], number[], number[]] = [
  [4, 5, 6],
  [40, 50, 60],
  [35, 45, 55]
];

describe('TimeSeries', () => {
  beforeEach(() => {
    uplotCalls.length = 0;
    setDataCalls.length = 0;
    destroyCalls.length = 0;
  });

  it('constructs a uPlot instance once on mount with the expected opts', () => {
    render(TimeSeries, {
      props: { data: DATA_A, series: SERIES, height: 180 }
    });

    expect(uplotCalls).toHaveLength(1);
    const { opts, data } = uplotCalls[0];
    const o = opts as { series: unknown[]; height: number };
    expect(Array.isArray(o.series)).toBe(true);
    expect(o.series).toHaveLength(SERIES.length);
    expect(o.height).toBe(180);
    expect(data).toBe(DATA_A);
  });

  it('calls setData when the data prop changes', async () => {
    const { rerender } = render(TimeSeries, {
      props: { data: DATA_A, series: SERIES, height: 180 }
    });

    expect(setDataCalls).toHaveLength(0);

    await rerender({ data: DATA_B, series: SERIES, height: 180 });

    expect(setDataCalls.length).toBeGreaterThanOrEqual(1);
    expect(setDataCalls[setDataCalls.length - 1][0]).toBe(DATA_B);
  });

  it('destroys the uPlot instance on unmount', () => {
    const { unmount } = render(TimeSeries, {
      props: { data: DATA_A, series: SERIES, height: 180 }
    });
    unmount();
    expect(destroyCalls.length).toBeGreaterThanOrEqual(1);
  });
});
