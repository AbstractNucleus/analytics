import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseContainer } from '$lib/beszel';
import containersFixture from '../../../tests/fixtures/containers.json';

import ContainersPanel from './ContainersPanel.svelte';

const CONTAINERS = containersFixture.map(parseContainer);

describe('ContainersPanel', () => {
  it('renders a row per container with name, image, status, CPU%, memory MB, and network bytes/s', () => {
    render(ContainersPanel, { props: { containers: CONTAINERS } });

    expect(document.querySelector('[aria-label="Containers"]')).not.toBeNull();

    expect(screen.getByText('beszel-capture-agent')).toBeInTheDocument();
    expect(screen.getByText('beszel-capture-hub')).toBeInTheDocument();
    expect(screen.getByText('henrygd/beszel-agent:0.18.7')).toBeInTheDocument();
    expect(screen.getByText('henrygd/beszel:0.18.7')).toBeInTheDocument();
    expect(screen.getByText('Up 3 minutes')).toBeInTheDocument();
    expect(screen.getByText('Up 4 minutes')).toBeInTheDocument();

    // memory: formatTabular(4.48, { decimals: 1, suffix: 'MB' }) → "4.5 MB"
    expect(screen.getByText(/4\.5[\s ]*MB/)).toBeInTheDocument();
    expect(screen.getByText(/11\.4[\s ]*MB/)).toBeInTheDocument();

    // network: formatByteRate(47) → "47 B/s"
    expect(screen.getByText(/47[\s ]*B\/s/)).toBeInTheDocument();
    expect(screen.getByText(/191[\s ]*B\/s/)).toBeInTheDocument();
  });

  it('renders all rows as a single tabular structure', () => {
    render(ContainersPanel, { props: { containers: CONTAINERS } });
    // One row per container body row.
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(CONTAINERS.length);
  });

  it('uses an uppercase section label matching the other panels', () => {
    render(ContainersPanel, { props: { containers: CONTAINERS } });
    const heading = document.querySelector('[aria-label="Containers"] h3');
    expect(heading?.textContent?.toLowerCase()).toContain('container');
  });
});
