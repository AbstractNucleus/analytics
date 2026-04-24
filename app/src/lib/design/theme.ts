// Theme store for the design system. Reads prefers-color-scheme for the
// initial default, persists manual overrides to localStorage, and reflects
// the active theme on <html data-theme>. Safe to import during SSR — all
// browser-only APIs are guarded.

import { writable } from 'svelte/store';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme';
const DEFAULT_SSR_THEME: Theme = 'dark';

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_SSR_THEME;

  try {
    const persisted = window.localStorage.getItem(STORAGE_KEY);
    if (persisted === 'dark' || persisted === 'light') return persisted;
  } catch {
    // localStorage may throw in privacy modes; fall through to system preference.
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return DEFAULT_SSR_THEME;
}

function applyTheme(value: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = value;
}

const initial = readInitialTheme();
export const theme = writable<Theme>(initial);

// Reflect the initial value on the root element so first paint matches the store.
applyTheme(initial);

export function setTheme(value: Theme): void {
  theme.set(value);
  applyTheme(value);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore storage failures — the in-memory store and DOM attribute are authoritative.
  }
}
