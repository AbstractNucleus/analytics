import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseSystem, parseSystemDetails } from '$lib/beszel';
import systemsFixture from '../../../tests/fixtures/systems.json';
import detailsFixture from '../../../tests/fixtures/system_details.json';

import HostMeta from './HostMeta.svelte';

const SYSTEM = parseSystem(systemsFixture[0]);
const DETAILS = parseSystemDetails(detailsFixture[0]);

describe('HostMeta', () => {
  it('renders the hostname and a status dot reflecting the current state', () => {
    render(HostMeta, { props: { system: SYSTEM, details: DETAILS } });
    expect(screen.getByText(SYSTEM.name)).toBeInTheDocument();
    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe(SYSTEM.status);
  });

  it('renders relative-time last-seen via formatRelativeTime', () => {
    const now = 1_700_000_000_000;
    const lastSeen = now - 45_000;
    render(HostMeta, {
      props: { system: SYSTEM, details: DETAILS, lastSeenMs: lastSeen, nowMs: now },
    });
    expect(screen.getByText(/45s ago/)).toBeInTheDocument();
  });

  it('renders kernel, CPU, and uptime from details + system', () => {
    render(HostMeta, { props: { system: SYSTEM, details: DETAILS } });
    expect(screen.getByText(DETAILS.kernel)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(DETAILS.cpu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    // uptime renders via formatUptime → e.g. "14d 03h"
    expect(screen.getByText(/\d+d \d+h/)).toBeInTheDocument();
  });

  it('hides empty rows when details fields are absent', () => {
    const sparseDetails = { ...DETAILS, kernel: '', cpu: '', osName: '', arch: '' };
    render(HostMeta, { props: { system: SYSTEM, details: sparseDetails } });
    expect(screen.queryByText(/Kernel/)).toBeNull();
    expect(screen.queryByText(/^CPU$/)).toBeNull();
    expect(screen.queryByText(/^OS$/)).toBeNull();
  });

  it('reflects the new "pending" status on the dot', () => {
    const pending = { ...SYSTEM, status: 'pending' as const };
    render(HostMeta, { props: { system: pending, details: DETAILS } });
    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe('pending');
  });
});
