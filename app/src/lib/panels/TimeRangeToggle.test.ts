import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// vi.mock() is hoisted above imports, so any factory it uses must come from
// vi.hoisted() to avoid referencing variables before they exist.
const { pageMock, gotoSpy } = vi.hoisted(() => {
  const pageMock = { url: new URL('http://localhost/hosts/foo') };
  const gotoSpy = vi.fn(async (target: string) => {
    pageMock.url = new URL(target, pageMock.url);
  });
  return { pageMock, gotoSpy };
});
vi.mock('$app/state', () => ({ page: pageMock }));
vi.mock('$app/navigation', () => ({ goto: gotoSpy }));

import TimeRangeToggle from './TimeRangeToggle.svelte';

describe('TimeRangeToggle', () => {
  beforeEach(() => {
    pageMock.url = new URL('http://localhost/hosts/foo');
    gotoSpy.mockClear();
  });

  it('renders four buttons for each allowed range', () => {
    render(TimeRangeToggle);
    for (const label of ['1h', '24h', '7d', '30d']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the default 24h button active when no ?range is set', () => {
    render(TimeRangeToggle);
    expect(screen.getByRole('button', { name: '24h' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '7d' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reads the active range from the URL', () => {
    pageMock.url = new URL('http://localhost/hosts/foo?range=7d');
    render(TimeRangeToggle);
    expect(screen.getByRole('button', { name: '7d' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '24h' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a non-default range navigates to the same path with ?range=', async () => {
    render(TimeRangeToggle);
    await fireEvent.click(screen.getByRole('button', { name: '7d' }));
    expect(gotoSpy).toHaveBeenCalledTimes(1);
    expect(gotoSpy.mock.calls[0][0]).toBe('/hosts/foo?range=7d');
  });

  it('clicking the default 24h range removes ?range= from the URL', async () => {
    pageMock.url = new URL('http://localhost/hosts/foo?range=7d');
    render(TimeRangeToggle);
    await fireEvent.click(screen.getByRole('button', { name: '24h' }));
    expect(gotoSpy).toHaveBeenCalledTimes(1);
    expect(gotoSpy.mock.calls[0][0]).toBe('/hosts/foo');
  });

  it('clicking the already-active range is a no-op', async () => {
    pageMock.url = new URL('http://localhost/hosts/foo?range=7d');
    render(TimeRangeToggle);
    await fireEvent.click(screen.getByRole('button', { name: '7d' }));
    expect(gotoSpy).not.toHaveBeenCalled();
  });
});
