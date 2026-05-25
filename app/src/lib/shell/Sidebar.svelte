<!-- Persistent host-list sidebar. The host group sort lifts "needs attention"
     systems (down → paused/pending → up) to the top, alphabetised within
     each group. A thin hairline separates the alerting group from the rest
     so the eye doesn't have to read every label to find a problem.

     Active highlight is computed from `currentSlug`, which the layout
     derives from `$app/state`. -->
<script lang="ts">
  import SidebarHostItem from './SidebarHostItem.svelte';
  import type { SystemRow, SystemStatus } from '$lib/beszel';

  type Props = {
    systems: SystemRow[];
    /** Active host slug (from URL). Empty when on the fleet route. */
    currentSlug?: string;
  };

  const { systems, currentSlug }: Props = $props();

  // Status priority — lower number sorts higher. Anything that isn't "up"
  // lands above "up" so problems surface; "down" first of all.
  const RANK: Record<SystemStatus, number> = {
    down: 0,
    paused: 1,
    pending: 2,
    up: 3,
  };

  const sorted = $derived(
    [...systems].sort((a, b) => {
      const ra = RANK[a.status] ?? 9;
      const rb = RANK[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    }),
  );

  const alerting = $derived(sorted.filter((s) => s.status !== 'up'));
  const healthy = $derived(sorted.filter((s) => s.status === 'up'));

  const counts = $derived(
    systems.reduce(
      (acc, s) => {
        acc.total += 1;
        acc[s.status] = (acc[s.status] ?? 0) + 1;
        return acc;
      },
      { total: 0 } as Record<SystemStatus | 'total', number>,
    ),
  );
</script>

<nav class="sidebar" aria-label="Hosts">
  <div class="head">
    <a class="head-title" href="/" aria-current={!currentSlug ? 'page' : undefined}>
      <span class="head-mark" aria-hidden="true"></span>
      <span class="head-text">Fleet</span>
    </a>
    <div class="head-counts" aria-live="polite">
      {#if (counts.down ?? 0) > 0}
        <span class="head-stat down">
          <span class="head-pip" aria-hidden="true"></span>
          <span>{counts.down}</span>
        </span>
      {/if}
      <span class="head-stat ok">
        <span class="head-pip" aria-hidden="true"></span>
        <span>{counts.up ?? 0}</span>
      </span>
      <span class="head-total">/ {counts.total}</span>
    </div>
  </div>

  <div class="scroll">
    {#if systems.length === 0}
      <div class="empty">
        <p class="empty-title">No hosts</p>
        <p class="empty-body">
          The Beszel hub didn't return any systems. Check
          <code>PUBLIC_BESZEL_URL</code> and that the hub is reachable.
        </p>
      </div>
    {:else}
      {#if alerting.length > 0}
        <ul class="group" aria-label="Needs attention">
          {#each alerting as system (system.id)}
            <li>
              <SidebarHostItem
                {system}
                active={currentSlug === system.slug}
              />
            </li>
          {/each}
        </ul>
        <hr class="divider" aria-hidden="true" />
      {/if}
      <ul class="group" aria-label="Healthy">
        {#each healthy as system (system.id)}
          <li>
            <SidebarHostItem
              {system}
              active={currentSlug === system.slug}
            />
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</nav>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-page);
    border-right: 1px solid var(--border-soft);
    min-width: 0;
    overflow: hidden;
  }

  /* Header strip --------------------------------------------------------- */
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem 0.625rem 1rem;
    border-bottom: 1px solid var(--border-soft);
    flex-shrink: 0;
    min-height: 2.5rem;
  }
  .head-title {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--fg-strong);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.2rem 0.35rem;
    border-radius: var(--radius-small);
    text-decoration: none;
    transition: background var(--motion-fast) var(--ease);
  }
  .head-title:hover {
    background: color-mix(in srgb, var(--bg-elevated) 50%, transparent);
  }
  .head-title[aria-current='page'] {
    color: var(--accent);
  }
  .head-mark {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 1px;
    background: var(--accent);
    box-shadow: 0 0 8px 0 color-mix(in srgb, var(--accent) 60%, transparent);
    transform: rotate(45deg);
  }

  .head-counts {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    color: var(--fg-muted);
  }
  .head-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .head-stat.down {
    color: var(--error);
  }
  .head-stat.ok {
    color: var(--success);
  }
  .head-pip {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    background: currentColor;
  }
  .head-stat.ok .head-pip {
    box-shadow: 0 0 4px 0 color-mix(in srgb, var(--success) 60%, transparent);
  }
  .head-total {
    color: var(--fg-muted);
    opacity: 0.7;
  }

  /* List ----------------------------------------------------------------- */
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.5rem 1rem;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  .scroll::-webkit-scrollbar {
    width: 8px;
  }
  .scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .scroll::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 4px;
  }

  .group {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .divider {
    margin: 0.6rem 0.4rem;
    border: none;
    height: 1px;
    background: var(--border-soft);
  }

  .empty {
    padding: 1.25rem 0.75rem;
    color: var(--fg-muted);
  }
  .empty-title {
    margin: 0 0 0.35rem;
    color: var(--fg-primary);
    font-size: 0.8125rem;
    font-weight: 500;
  }
  .empty-body {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.45;
  }
  .empty code {
    background: var(--bg-elevated);
    padding: 0.05rem 0.3rem;
    border-radius: var(--radius-small);
    font-size: 0.7rem;
  }
</style>
