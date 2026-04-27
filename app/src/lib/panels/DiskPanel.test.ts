import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('uplot', () => {
  class MockUplot {
    constructor() {}
    setData() {}
    destroy() {}
  }
  return { default: MockUplot };
});

import DiskPanel from './DiskPanel.svelte';

describe('DiskPanel', () => {
  it('renders the current disk percent with 1-decimal tabular formatting', () => {
    render(DiskPanel, { props: { currentPct: 42.5, diskTotalGb: 512 } });
    expect(screen.getByText(/42\.5%/)).toBeInTheDocument();
  });

  it('renders used/total in GB when diskTotalGb is provided', () => {
    render(DiskPanel, { props: { currentPct: 42.5, diskTotalGb: 512 } });
    // 42.5% of 512 = 217.6
    expect(screen.getByText(/217\.6/)).toBeInTheDocument();
    expect(screen.getByText(/512/)).toBeInTheDocument();
    expect(screen.getAllByText(/GB/).length).toBeGreaterThan(0);
  });

  it('omits the used/total line when diskTotalGb is undefined', () => {
    render(DiskPanel, { props: { currentPct: 42.5 } });
    expect(screen.getByText(/42\.5%/)).toBeInTheDocument();
    expect(screen.queryByText(/GB/)).toBeNull();
  });
});
