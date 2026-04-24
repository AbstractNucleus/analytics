import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseSystem } from '$lib/beszel';
import systemsFixture from '../../../tests/fixtures/systems.json';

import HostHeader from './HostHeader.svelte';

const BSERVER = parseSystem(systemsFixture[0]); // status 'up'
const PI = parseSystem(systemsFixture[2]); // status 'paused'

describe('HostHeader', () => {
  it('renders hostname and a status dot reflecting up state', () => {
    render(HostHeader, { props: { system: BSERVER } });
    expect(screen.getByText(/bserver/)).toBeInTheDocument();
    const dot = document.querySelector('.status-dot');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('data-status')).toBe('up');
  });

  it('shows relative-time last-seen via formatRelativeTime', () => {
    const now = 1_700_000_000_000;
    const lastSeen = now - 45_000; // 45 seconds ago
    render(HostHeader, { props: { system: BSERVER, lastSeenMs: lastSeen, nowMs: now } });
    expect(screen.getByText(/45s ago/)).toBeInTheDocument();
  });

  it('reflects paused status on the dot', () => {
    render(HostHeader, { props: { system: PI } });
    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe('paused');
  });
});
