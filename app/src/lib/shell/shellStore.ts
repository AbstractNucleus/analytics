// Shell layout state — sidebar width + collapsed flag, persisted to
// localStorage so the user's choice survives reload. Initialised with the
// defaults during SSR (no `window`), then hydrated from localStorage on the
// client via `restoreShellState()` once a component mounts.

import { writable, type Writable, get } from 'svelte/store';

export interface ShellState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

const DEFAULTS: ShellState = {
  sidebarWidth: 288,
  sidebarCollapsed: false,
};

export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 480;

const STORAGE_KEY = 'analytics:shell';

function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return DEFAULTS.sidebarWidth;
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(w)));
}

export const shellState: Writable<ShellState> = writable<ShellState>(DEFAULTS);

/**
 * Hydrate the store from localStorage. Safe to call multiple times; idempotent.
 * No-op during SSR.
 */
export function restoreShellState(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ShellState>;
    shellState.update((curr) => ({
      sidebarWidth:
        typeof parsed.sidebarWidth === 'number'
          ? clampWidth(parsed.sidebarWidth)
          : curr.sidebarWidth,
      sidebarCollapsed:
        typeof parsed.sidebarCollapsed === 'boolean'
          ? parsed.sidebarCollapsed
          : curr.sidebarCollapsed,
    }));
  } catch {
    // Malformed JSON or storage blocked — fall back to defaults silently.
  }
}

/** Persist the current store value to localStorage. */
function persist(state: ShellState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be disabled / quota exceeded — non-fatal.
  }
}

// Auto-persist on any change. The subscription is set up once at module load
// and never torn down; the store lives for the page's lifetime.
shellState.subscribe(persist);

export function setSidebarWidth(width: number): void {
  shellState.update((curr) => ({ ...curr, sidebarWidth: clampWidth(width) }));
}

export function toggleSidebar(): void {
  shellState.update((curr) => ({
    ...curr,
    sidebarCollapsed: !curr.sidebarCollapsed,
  }));
}

export function setSidebarCollapsed(collapsed: boolean): void {
  shellState.update((curr) => ({ ...curr, sidebarCollapsed: collapsed }));
}

/** Read the current state without subscribing. Useful in event handlers. */
export function readShellState(): ShellState {
  return get(shellState);
}
