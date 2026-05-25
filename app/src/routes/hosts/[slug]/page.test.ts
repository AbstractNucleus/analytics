import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseContainer, parseStatsSample, parseSystem, parseSystemDetails } from '$lib/beszel';
import systemsFixture from '../../../../tests/fixtures/systems.json';
import systemDetailsFixture from '../../../../tests/fixtures/system_details.json';
import statsFixture from '../../../../tests/fixtures/system_stats.json';
import containersFixture from '../../../../tests/fixtures/containers.json';

vi.mock('uplot', () => {
  class MockUplot {
    constructor() {}
    setData() {}
    destroy() {}
  }
  return { default: MockUplot };
});

import Page from './+page.svelte';

const SYSTEM = parseSystem(systemsFixture[0]);
const SYSTEM_DETAILS = parseSystemDetails(systemDetailsFixture[0]);
const SAMPLES = statsFixture.items
  .filter((row) => row.system === SYSTEM.id)
  .map(parseStatsSample);
const CONTAINERS = containersFixture
  .filter((row) => row.system === SYSTEM.id)
  .map(parseContainer);

describe('per-host view (hosts/[slug]/+page.svelte)', () => {
  beforeEach(() => {
    /* no shared state */
  });

  it('renders the host header and every panel for the loaded system', () => {
    render(Page, {
      props: {
        data: {
          system: SYSTEM,
          systemDetails: SYSTEM_DETAILS,
          samples: SAMPLES,
          containers: CONTAINERS,
          beszelUrl: undefined,
          systems: [],
        },
      },
    });

    expect(screen.getByText(SYSTEM.name)).toBeInTheDocument();
    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe(SYSTEM.status);

    expect(document.querySelector('[aria-label="Host details"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="CPU"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Memory"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Disk"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Network"]')).not.toBeNull();
  });

  it('surfaces kernel and OS name from SystemDetails in the host meta strip', () => {
    render(Page, {
      props: {
        data: {
          system: SYSTEM,
          systemDetails: SYSTEM_DETAILS,
          samples: SAMPLES,
          containers: CONTAINERS,
          beszelUrl: undefined,
          systems: [],
        },
      },
    });
    expect(screen.getByText(SYSTEM_DETAILS.kernel)).toBeInTheDocument();
    // OS is rendered as `osName · arch` when arch is present.
    expect(
      screen.getByText(new RegExp(SYSTEM_DETAILS.osName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    ).toBeInTheDocument();
  });
});
