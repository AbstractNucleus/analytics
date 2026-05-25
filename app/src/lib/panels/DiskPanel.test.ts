import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import type { StatsSample } from '$lib/beszel';

vi.mock('uplot', () => {
  class MockUplot {
    constructor() {}
    setData() {}
    destroy() {}
  }
  return { default: MockUplot };
});

import DiskPanel from './DiskPanel.svelte';

function sample(over: Partial<StatsSample> = {}): StatsSample {
  return {
    systemId: 's1',
    timestamp: 0,
    type: '1m',
    cpuPct: 0,
    memPct: 0,
    memTotalGb: 0,
    memUsedGb: 0,
    diskPct: 42.5,
    diskTotalGb: 512,
    diskUsedGb: 217.6,
    disks: [
      { name: '/', totalGb: 512, usedGb: 217.6, pct: 42.5 },
    ],
    diskReadBps: 0,
    diskWriteBps: 0,
    loadAvg: [0, 0, 0],
    netSentBps: 0,
    netRecvBps: 0,
    ...over,
  };
}

describe('DiskPanel', () => {
  it('renders the root disk percent with 1-decimal formatting', () => {
    render(DiskPanel, { props: { latest: sample() } });
    expect(screen.getByText(/42\.5%/)).toBeInTheDocument();
  });

  it('renders used/total in GB for the root disk', () => {
    render(DiskPanel, { props: { latest: sample() } });
    expect(screen.getByText(/217\.6/)).toBeInTheDocument();
    expect(screen.getByText(/512/)).toBeInTheDocument();
    expect(screen.getAllByText(/GB/).length).toBeGreaterThan(0);
  });

  it('renders one row per disk when multiple filesystems are reported', () => {
    const { container } = render(DiskPanel, {
      props: {
        latest: sample({
          disks: [
            { name: '/', totalGb: 229, usedGb: 158, pct: 72.6 },
            { name: '/secondary', totalGb: 916, usedGb: 0.001, pct: 0.0 },
          ],
        }),
      },
    });
    const names = Array.from(container.querySelectorAll('.disk-name')).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['/', '/secondary']);
    expect(screen.getByText(/72\.6%/)).toBeInTheDocument();
    expect(screen.getByText(/0\.0%/)).toBeInTheDocument();
  });

  it('shows the EXTRA_FILESYSTEMS hint when only the root mount is reported', () => {
    render(DiskPanel, { props: { latest: sample() } });
    expect(screen.getByText(/EXTRA_FILESYSTEMS/)).toBeInTheDocument();
  });

  it('hides the EXTRA_FILESYSTEMS hint once an extra filesystem is reported', () => {
    render(DiskPanel, {
      props: {
        latest: sample({
          disks: [
            { name: '/', totalGb: 100, usedGb: 50, pct: 50 },
            { name: '/data', totalGb: 1000, usedGb: 500, pct: 50 },
          ],
        }),
      },
    });
    expect(screen.queryByText(/EXTRA_FILESYSTEMS/)).toBeNull();
  });

  it('renders read/write rates when the agent reports them', () => {
    render(DiskPanel, {
      props: {
        latest: sample({ diskReadBps: 1024 * 1024, diskWriteBps: 512 * 1024 }),
      },
    });
    // Header strip should now have a Read + Write swatch+rate.
    expect(screen.getByText(/Read/)).toBeInTheDocument();
    expect(screen.getByText(/Write/)).toBeInTheDocument();
  });

  it('renders an empty state when no sample is provided', () => {
    render(DiskPanel, { props: {} });
    expect(screen.getByText(/No disk reported/)).toBeInTheDocument();
  });
});
