import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import TempsPanel from './TempsPanel.svelte';

describe('TempsPanel', () => {
  it('lists temperature sensors with current values + °C suffix', () => {
    render(TempsPanel, {
      props: {
        temps: { coretemp_package_id_0: 54.2, nvme_composite: 41.0 }
      }
    });

    expect(screen.getByText(/coretemp_package_id_0/)).toBeInTheDocument();
    expect(screen.getByText(/nvme_composite/)).toBeInTheDocument();
    // formatTabular with suffix uses NBSP (\u00A0) before the unit; match
    // the digits and the degree glyph independently of the separator.
    expect(screen.getByText(/54\.2[\s\u00A0]*°C/)).toBeInTheDocument();
    expect(screen.getByText(/41\.0[\s\u00A0]*°C/)).toBeInTheDocument();
  });

  it('renders an empty-state when no temps are reported', () => {
    render(TempsPanel, { props: { temps: {} } });
    expect(screen.getByText(/no sensors/i)).toBeInTheDocument();
  });
});
