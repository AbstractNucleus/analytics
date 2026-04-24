import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';

import { parseSystem } from '$lib/beszel';
import systemsFixture from '../../tests/fixtures/systems.json';

import Page from './+page.svelte';

const SYSTEMS = systemsFixture.map(parseSystem);

describe('fleet view (+page.svelte)', () => {
  it('renders one fleet row per host in the load result', () => {
    const { container } = render(Page, {
      props: { data: { systems: SYSTEMS } }
    });

    const rows = container.querySelectorAll('.fleet-row');
    expect(rows).toHaveLength(SYSTEMS.length);
    for (const system of SYSTEMS) {
      expect(container.querySelector(`.fleet-row[data-slug="${system.slug}"]`)).not.toBeNull();
    }
  });
});
