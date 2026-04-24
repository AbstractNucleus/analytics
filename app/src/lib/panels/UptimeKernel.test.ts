import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import UptimeKernel from './UptimeKernel.svelte';

describe('UptimeKernel', () => {
  it('renders formatted uptime, kernel, and OS name from its primitive props', () => {
    render(UptimeKernel, {
      props: {
        uptimeSeconds: 1_209_600, // 14 days exactly
        kernel: '6.8.0-52-generic',
        osName: 'Ubuntu 24.04',
      },
    });
    expect(screen.getByText(/14d 00h/)).toBeInTheDocument();
    expect(screen.getByText(/6\.8\.0-52-generic/)).toBeInTheDocument();
    expect(screen.getByText(/Ubuntu 24\.04/)).toBeInTheDocument();
  });

  it('renders gracefully when details are absent', () => {
    render(UptimeKernel, {
      props: {
        uptimeSeconds: 0,
        kernel: '',
        osName: '',
      },
    });
    // formatUptime(0) → "0d 00h".
    expect(screen.getByText(/0d 00h/)).toBeInTheDocument();
  });
});
