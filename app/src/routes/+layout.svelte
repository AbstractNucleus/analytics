<!-- App shell. Three regions stacked vertically: header on top, then a two-pane
     body with a persistent host-list sidebar on the left and the routed
     content on the right. A draggable separator between the two panes
     persists its width to localStorage via shellStore. -->
<script lang="ts">
  import '$lib/design';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { TimeRangeToggle } from '$lib/panels';
  import {
    Sidebar,
    ResizeHandle,
    shellState,
    setSidebarWidth,
    toggleSidebar,
    restoreShellState,
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
  } from '$lib/shell';
  import type { SystemRow } from '$lib/beszel';

  let { children } = $props();

  // Pull systems off layout data. Always present (defaults to []) thanks to
  // the layout server load's graceful failure.
  const systems = $derived(
    ((page.data as { systems?: SystemRow[] }).systems ?? []) as SystemRow[],
  );

  // Active host slug, when we're on the per-host route. Used to highlight
  // the active item in the sidebar AND to render a breadcrumb in the header.
  const onHostPage = $derived(page.route.id === '/hosts/[slug]');
  const currentSlug = $derived(
    onHostPage ? ((page.params as { slug?: string }).slug ?? '') : '',
  );
  const currentSystem = $derived(
    currentSlug ? systems.find((s) => s.slug === currentSlug) : undefined,
  );

  // Restore persisted sidebar width / collapsed state once on mount.
  onMount(() => {
    restoreShellState();
  });
</script>

<div class="app" class:sidebar-collapsed={$shellState.sidebarCollapsed}>
  <header class="topbar">
    <div class="topbar-left">
      <button
        type="button"
        class="icon-btn sidebar-toggle"
        onclick={toggleSidebar}
        aria-label={$shellState.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-pressed={!$shellState.sidebarCollapsed}
        title="Toggle sidebar"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M2 3.25C2 2.56 2.56 2 3.25 2h9.5C13.44 2 14 2.56 14 3.25v9.5C14 13.44 13.44 14 12.75 14h-9.5C2.56 14 2 13.44 2 12.75v-9.5zM6 3v10h6.75a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25H6z"
            fill="currentColor"
          />
        </svg>
      </button>

      <a class="brand" href="/" aria-label="analytics — fleet">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-text">analytics</span>
      </a>

      {#if onHostPage}
        <span class="crumb-sep" aria-hidden="true">/</span>
        <span class="crumb">
          {#if currentSystem}
            <span class="crumb-pip" data-status={currentSystem.status} aria-hidden="true"></span>
            <span class="crumb-name">{currentSystem.name}</span>
          {:else}
            <span class="crumb-name muted">{currentSlug}</span>
          {/if}
        </span>
      {/if}
    </div>

    <div class="topbar-right">
      <TimeRangeToggle />
    </div>
  </header>

  <div
    class="body"
    style:--sidebar-width="{$shellState.sidebarCollapsed ? 0 : $shellState.sidebarWidth}px"
  >
    {#if !$shellState.sidebarCollapsed}
      <aside class="aside">
        <Sidebar {systems} {currentSlug} />
      </aside>
      <ResizeHandle
        value={$shellState.sidebarWidth}
        onResize={setSidebarWidth}
        min={MIN_SIDEBAR_WIDTH}
        max={MAX_SIDEBAR_WIDTH}
      />
    {/if}
    <main class="main">
      <div class="main-inner">
        {@render children?.()}
      </div>
    </main>
  </div>
</div>

<style>
  :global(a) {
    color: var(--accent);
    text-decoration: none;
  }
  :global(html, body) {
    overflow: hidden; /* the body region scrolls; the page itself does not */
  }

  .app {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100vh;
    width: 100vw;
    background:
      radial-gradient(
        100% 80% at 0% 0%,
        color-mix(in srgb, var(--accent) 5%, transparent),
        transparent 60%
      ),
      var(--bg-page);
  }

  /* Top bar ------------------------------------------------------------- */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0.875rem;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--bg-surface) 95%, transparent),
      color-mix(in srgb, var(--bg-surface) 80%, transparent)
    );
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border-soft);
    min-height: 2.75rem;
    z-index: 10;
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-small);
    color: var(--fg-muted);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }
  .icon-btn:hover {
    background: color-mix(in srgb, var(--bg-elevated) 60%, transparent);
    color: var(--fg-strong);
  }
  .icon-btn[aria-pressed='false'] {
    color: var(--fg-primary);
    background: color-mix(in srgb, var(--bg-elevated) 40%, transparent);
  }
  .icon-btn:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--fg-strong);
    font-weight: 600;
    letter-spacing: -0.01em;
    font-size: 0.9rem;
    padding: 0.2rem 0.35rem;
    border-radius: var(--radius-small);
  }
  .brand:hover {
    background: color-mix(in srgb, var(--bg-elevated) 50%, transparent);
  }
  .brand-mark {
    display: inline-block;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 1px;
    background: var(--accent);
    box-shadow: 0 0 10px 0 color-mix(in srgb, var(--accent) 55%, transparent);
    transform: rotate(45deg);
  }

  .crumb-sep {
    color: var(--fg-muted);
    opacity: 0.4;
    margin: 0 0.1rem;
    font-size: 0.85rem;
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    color: var(--fg-strong);
    font-size: 0.85rem;
    padding: 0.2rem 0.35rem;
    border-radius: var(--radius-small);
  }
  .crumb-pip {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--fg-muted);
    flex-shrink: 0;
  }
  .crumb-pip[data-status='up'] {
    background: var(--success);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--success) 60%, transparent);
  }
  .crumb-pip[data-status='down'] {
    background: var(--error);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--error) 55%, transparent);
  }
  .crumb-pip[data-status='paused'],
  .crumb-pip[data-status='pending'] {
    opacity: 0.6;
  }
  .crumb-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    letter-spacing: -0.005em;
  }
  .crumb-name.muted {
    color: var(--fg-muted);
  }

  /* Two-pane body ------------------------------------------------------- */
  .body {
    display: grid;
    grid-template-columns: var(--sidebar-width) auto minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }
  .app.sidebar-collapsed .body {
    grid-template-columns: minmax(0, 1fr);
  }
  .aside {
    grid-column: 1;
    min-width: 0;
    overflow: hidden;
  }
  .main {
    grid-column: 3;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  .app.sidebar-collapsed .main {
    grid-column: 1;
  }
  .main::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  .main::-webkit-scrollbar-track {
    background: transparent;
  }
  .main::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 5px;
  }
  .main::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--accent) 35%, var(--border-strong));
  }

  .main-inner {
    max-width: 1480px;
    margin: 0 auto;
    padding: 1.125rem 1.25rem 2rem;
  }

  /* Responsive: on narrow viewports the sidebar overlays the main pane
     when expanded instead of squeezing it. */
  @media (max-width: 720px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
      position: relative;
    }
    .app:not(.sidebar-collapsed) .aside {
      position: absolute;
      inset: 0 auto 0 0;
      width: min(86vw, 320px);
      z-index: 6;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    .app:not(.sidebar-collapsed) .main {
      grid-column: 1;
    }
    .main-inner {
      padding: 0.875rem 1rem 1.5rem;
    }
  }
</style>
