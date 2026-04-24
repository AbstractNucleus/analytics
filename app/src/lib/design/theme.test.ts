// Tests for the design-system theme store: system-preference default,
// manual override persistence, and reload-honors-persisted-choice.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'theme';

type ColorScheme = 'dark' | 'light';

function installMatchMedia(scheme: ColorScheme) {
  const isDark = scheme === 'dark';
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? isDark : !isDark,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: (ev: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (ev: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

async function loadThemeModule() {
  vi.resetModules();
  return await import('./theme');
}

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    installMatchMedia('dark');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('defaults to prefers-color-scheme when localStorage is empty', async () => {
    installMatchMedia('light');
    const { theme } = await loadThemeModule();
    expect(get(theme)).toBe('light');

    localStorage.clear();
    installMatchMedia('dark');
    const reloaded = await loadThemeModule();
    expect(get(reloaded.theme)).toBe('dark');
  });

  it("setTheme('light') writes data-theme attribute and persists to localStorage", async () => {
    const { setTheme, theme } = await loadThemeModule();
    setTheme('light');
    expect(get(theme)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('reload honors persisted choice over system preference', async () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    installMatchMedia('dark');
    const { theme } = await loadThemeModule();
    expect(get(theme)).toBe('light');
  });
});
