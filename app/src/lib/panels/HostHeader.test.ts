import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseSystem } from '$lib/beszel';
import systemsFixture from '../../../tests/fixtures/systems.json';

import HostHeader from './HostHeader.svelte';

const SYSTEM = parseSystem(systemsFixture[0]);

describe('HostHeader', () => {
  it('renders the hostname and a status dot reflecting the current state', () => {
    render(HostHeader, { props: { system: SYSTEM } });
    expect(screen.getByText(SYSTEM.name)).toBeInTheDocument();
    const dot = document.querySelector('.status-dot');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('data-status')).toBe(SYSTEM.status);
  });

  it('shows relative-time last-seen via formatRelativeTime', () => {
    const now = 1_700_000_000_000;
    const lastSeen = now - 45_000;
    render(HostHeader, {
      props: { system: SYSTEM, lastSeenMs: lastSeen, nowMs: now },
    });
    expect(screen.getByText(/45s ago/)).toBeInTheDocument();
  });

  it('reflects an overridden status on the dot', () => {
    const paused = { ...SYSTEM, status: 'paused' as const };
    render(HostHeader, { props: { system: paused } });
    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe('paused');
  });

  it('reflects the new "pending" status on the dot', () => {
    const pending = { ...SYSTEM, status: 'pending' as const };
    render(HostHeader, { props: { system: pending } });
    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe('pending');
  });
});
