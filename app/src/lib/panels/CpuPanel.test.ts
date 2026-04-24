import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseStatsSample } from '$lib/beszel';
import statsFixture from '../../../tests/fixtures/system_stats.json';

const uplotCalls: Array<{ opts: unknown; data: unknown }> = [];

vi.mock('uplot', () => {
  class MockUplot {
    constructor(opts: unknown, data: unknown) {
      uplotCalls.push({ opts, data });
    }
    setData() {}
    destroy() {}
  }
  return { default: MockUplot };
});

import CpuPanel from './CpuPanel.svelte';

const SAMPLES = statsFixture.items
  .filter((row) => row.system === 'abc123def456ghi')
  .map(parseStatsSample);

describe('CpuPanel', () => {
  beforeEach(() => {
    uplotCalls.length = 0;
  });

  it('renders the current CPU percent with tabular formatting', () => {
    render(CpuPanel, { props: { samples: SAMPLES, currentPct: 23.5 } });
    expect(screen.getByText(/23\.5%/)).toBeInTheDocument();
  });

  it('falls back to the last sample when currentPct is omitted', () => {
    render(CpuPanel, { props: { samples: SAMPLES } });
    const last = SAMPLES[SAMPLES.length - 1].cpuPct.toFixed(1);
    expect(screen.getByText(new RegExp(`${last}%`))).toBeInTheDocument();
  });

  it('constructs uPlot with a single-series sparkline (timestamps + cpu)', () => {
    render(CpuPanel, { props: { samples: SAMPLES, currentPct: 23.5 } });
    expect(uplotCalls).toHaveLength(1);
    const opts = uplotCalls[0].opts as { series: unknown[] };
    // [x-axis-placeholder, cpu]
    expect(opts.series).toHaveLength(2);
    const data = uplotCalls[0].data as number[][];
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveLength(SAMPLES.length);
    expect(data[1]).toHaveLength(SAMPLES.length);
  });
});
