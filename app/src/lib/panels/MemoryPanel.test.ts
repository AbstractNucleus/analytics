import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import MemoryPanel from './MemoryPanel.svelte';

const GB = 1024 * 1024 * 1024;

describe('MemoryPanel', () => {
  it('renders the current memory percent and used/total in GB', () => {
    render(MemoryPanel, {
      props: { currentPct: 48.2, memoryBytes: 32 * GB },
    });

    expect(screen.getByText(/48\.2%/)).toBeInTheDocument();
    // Used = 48.2% of 32 GB ≈ 15.4 GB.
    expect(screen.getByText(/15\.4/)).toBeInTheDocument();
    expect(screen.getAllByText(/GB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/32/)).toBeInTheDocument();
  });

  it('renders em-dashes when currentPct is missing', () => {
    render(MemoryPanel, { props: { memoryBytes: 32 * GB } });
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });

  it('accepts non-power-of-two totals and renders them to the nearest GB', () => {
    // Real system_details memory: 16_717_656_064 bytes ≈ 15.57 GB.
    render(MemoryPanel, {
      props: { currentPct: 5.2, memoryBytes: 16_717_656_064 },
    });
    expect(screen.getByText(/5\.2%/)).toBeInTheDocument();
    // Rounded-to-0-decimals total is 16.
    expect(screen.getByText(/\b16\b/)).toBeInTheDocument();
  });
});
