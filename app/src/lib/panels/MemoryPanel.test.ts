import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import MemoryPanel from './MemoryPanel.svelte';

describe('MemoryPanel', () => {
  it('renders the current memory percent and used/total in GB', () => {
    render(MemoryPanel, {
      props: { currentPct: 48.2, memGb: 32 }
    });

    // Percent rendered with a tabular 1-decimal readout.
    expect(screen.getByText(/48\.2%/)).toBeInTheDocument();
    // Used value = 48.2% of 32 ≈ 15.4. Total = 32.
    expect(screen.getByText(/15\.4/)).toBeInTheDocument();
    // Suffix "GB" should appear near the total.
    expect(screen.getAllByText(/GB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/32/)).toBeInTheDocument();
  });

  it('renders an em-dash when currentPct is missing', () => {
    render(MemoryPanel, { props: { memGb: 32 } });
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
