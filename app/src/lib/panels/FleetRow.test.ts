import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseStatsSample, parseSystem } from '$lib/beszel';
import systemsFixture from '../../../tests/fixtures/systems.json';
import statsFixture from '../../../tests/fixtures/system_stats.json';

import FleetRow from './FleetRow.svelte';

const SYSTEM = parseSystem(systemsFixture[0]);
// Newest sample for this system (fixture is -created sort, so items[0] is latest).
const LATEST = parseStatsSample(
  statsFixture.items.find((row) => row.system === SYSTEM.id)!,
);

describe('FleetRow', () => {
  it('renders name, cpu %, mem %, and a status dot in one line', () => {
    const now = 1_700_000_000_000;
    const lastSeen = now - 30_000;
    render(FleetRow, {
      props: { system: SYSTEM, latest: LATEST, lastSeenMs: lastSeen, nowMs: now },
    });

    expect(screen.getByText(SYSTEM.name)).toBeInTheDocument();
    expect(screen.getByText(/30s ago/)).toBeInTheDocument();

    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe(SYSTEM.status);

    // CPU and mem readouts are rendered as percent values tied to the fixture sample.
    expect(screen.getByText(new RegExp(`${LATEST.cpuPct.toFixed(1)}%`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${LATEST.memPct.toFixed(1)}%`))).toBeInTheDocument();
  });

  it('falls back to system.cpuPct/memPct when latest is not provided', () => {
    render(FleetRow, { props: { system: SYSTEM } });
    expect(screen.getByText(SYSTEM.name)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${SYSTEM.cpuPct.toFixed(1)}%`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${SYSTEM.memPct.toFixed(1)}%`))).toBeInTheDocument();
  });

  it('uses latest sample when both latest and system metrics are present', () => {
    // Build a sample whose values clearly differ from the system's static info.
    const overriding: typeof LATEST = { ...LATEST, cpuPct: 88.5, memPct: 12.5 };
    render(FleetRow, { props: { system: SYSTEM, latest: overriding } });
    expect(screen.getByText(/88\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/12\.5%/)).toBeInTheDocument();
  });

  it('renders em-dashes for a pending system that has never reported', () => {
    const pending: typeof SYSTEM = {
      ...SYSTEM,
      status: 'pending',
      cpuPct: 0,
      memPct: 0,
      lastSeenMs: NaN,
    };
    render(FleetRow, { props: { system: pending } });
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });
});
