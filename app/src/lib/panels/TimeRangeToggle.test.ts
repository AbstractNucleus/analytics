import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';

import TimeRangeToggle from './TimeRangeToggle.svelte';
import { range, setRange } from './timeRangeStore';

describe('TimeRangeToggle', () => {
  beforeEach(() => {
    setRange('24h');
  });

  it('renders four buttons for each allowed range', () => {
    render(TimeRangeToggle);
    for (const label of ['1h', '24h', '7d', '30d']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it("marks the active button with aria-pressed='true' to match $range", () => {
    render(TimeRangeToggle);
    const active = screen.getByRole('button', { name: '24h' });
    expect(active.getAttribute('aria-pressed')).toBe('true');

    const inactive = screen.getByRole('button', { name: '7d' });
    expect(inactive.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a button calls setRange and updates the store', async () => {
    render(TimeRangeToggle);
    const btn = screen.getByRole('button', { name: '7d' });
    await fireEvent.click(btn);
    expect(get(range)).toBe('7d');
  });
});
