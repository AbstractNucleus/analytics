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

import NetworkPanel from './NetworkPanel.svelte';

const SAMPLES = statsFixture.items
  .filter((row) => row.system === 'abc123def456ghi')
  .map(parseStatsSample);

describe('NetworkPanel', () => {
  beforeEach(() => {
    uplotCalls.length = 0;
  });

  it('renders current read + sent rates via formatByteRate', () => {
    render(NetworkPanel, {
      props: { samples: SAMPLES, currentReadBps: 1_048_576, currentSentBps: 524_288 }
    });
    // 1_048_576 B/s -> 1.05 MB/s (1048576 / 1e6 = 1.048576)
    expect(screen.getByText(/1\.05.*MB\/s/)).toBeInTheDocument();
    // 524_288 B/s -> 524.29 KB/s
    expect(screen.getByText(/524\.29.*KB\/s/)).toBeInTheDocument();
  });

  it('constructs uPlot with read + sent series (3 entries total)', () => {
    render(NetworkPanel, {
      props: { samples: SAMPLES, currentReadBps: 1_048_576, currentSentBps: 524_288 }
    });
    expect(uplotCalls).toHaveLength(1);
    const opts = uplotCalls[0].opts as { series: unknown[] };
    // [x-axis-placeholder, read, sent]
    expect(opts.series).toHaveLength(3);
    const data = uplotCalls[0].data as number[][];
    expect(data).toHaveLength(3);
    expect(data[0]).toHaveLength(SAMPLES.length);
    expect(data[1]).toHaveLength(SAMPLES.length);
    expect(data[2]).toHaveLength(SAMPLES.length);
  });
});
