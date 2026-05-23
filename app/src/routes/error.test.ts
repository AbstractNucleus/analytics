import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';

// SvelteKit's $app/state is a reactive proxy in the real app; for a
// one-shot component render a plain object suffices since the test never
// re-renders.
vi.mock('$app/state', () => ({
  page: { status: 503, error: { message: 'fetch failed: hub unreachable' } }
}));

import ErrorPage from './+error.svelte';

describe('+error.svelte', () => {
  it('renders the status code and error message', () => {
    const { container } = render(ErrorPage);
    expect(container.querySelector('.status')?.textContent).toBe('503');
    expect(container.querySelector('.message')?.textContent).toBe(
      'fetch failed: hub unreachable'
    );
    expect(container.querySelector('a.back')?.getAttribute('href')).toBe('/');
  });
});
