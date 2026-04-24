import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseContainer, parseStatsSample, parseSystem } from '$lib/beszel';
import systemsFixture from '../../../../tests/fixtures/systems.json';
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
const SAMPLES = statsFixture.items
  .filter((row) => row.system === 'abc123def456ghi')
  .map(parseStatsSample);
const CONTAINERS = containersFixture
  .filter((row) => row.system === 'abc123def456ghi')
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
          samples: SAMPLES,
          containers: CONTAINERS,
          beszelUrl: undefined
        }
      }
    });

    // HostHeader: hostname + status dot.
    expect(screen.getByText(/bserver/)).toBeInTheDocument();
    const dot = document.querySelector('.status-dot');
    expect(dot?.getAttribute('data-status')).toBe('up');

    // Panel section aria-labels give us a reliable way to confirm each panel
    // is mounted without binding tests to internal DOM structure.
    expect(document.querySelector('[aria-label="CPU"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Memory"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Disk"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Network"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Temperatures"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Uptime and kernel"]')).not.toBeNull();
  });
});
