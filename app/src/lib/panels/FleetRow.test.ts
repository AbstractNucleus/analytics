import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseStatsSample, parseSystem } from '$lib/beszel';
import systemsFixture from '../../../tests/fixtures/systems.json';
import statsFixture from '../../../tests/fixtures/system_stats.json';

import FleetRow from './FleetRow.svelte';

const BSERVER = parseSystem(systemsFixture[0]);
const LATEST = parseStatsSample(
  statsFixture.items.find((row) => row.system === 'abc123def456ghi')!
);

describe('FleetRow', () => {
  it('renders name, cpu %, mem %, and a status dot in one line', () => {
    const now = 1_700_000_000_000;
    const lastSeen = now - 30_000; // 30s ago
    render(FleetRow, {
      props: { system: BSERVER, latest: LATEST, lastSeenMs: lastSeen, nowMs: now }
    });

    expect(screen.getByText(/bserver/)).toBeInTheDocument();
    // CPU 23.5% and mem 48.2% from fixture.
    expect(screen.getByText(/23\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/48\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/30s ago/)).toBeInTheDocument();

    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe('up');
  });

  it('renders em-dashes when no latest stat is available', () => {
    render(FleetRow, { props: { system: BSERVER } });
    expect(screen.getByText(/bserver/)).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });
});
