import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import { parseSystem } from '$lib/beszel';
import systemsFixture from '../../../tests/fixtures/systems.json';

import UptimeKernel from './UptimeKernel.svelte';

const BSERVER = parseSystem(systemsFixture[0]); // uptime 1_209_600s = 14d 00h

describe('UptimeKernel', () => {
  it('renders formatted uptime and the kernel string', () => {
    render(UptimeKernel, { props: { system: BSERVER } });
    // 1_209_600 seconds = 14 days exactly → "14d 00h".
    expect(screen.getByText(/14d 00h/)).toBeInTheDocument();
    expect(screen.getByText(/6\.8\.0-52-generic/)).toBeInTheDocument();
  });
});
