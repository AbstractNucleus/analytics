<!-- Root layout: pulls in design tokens and hoists the TimeRangeToggle into a
     shared header so every route inherits the same visual chrome. The fleet
     pulse counts only render on the fleet route (`/`) — the per-host page
     swaps them out for a back-affordance and a host-status sliver. -->
<script lang="ts">
  import '$lib/design';
  import { page } from '$app/state';
  import { TimeRangeToggle } from '$lib/panels';
  import type { SystemRow, SystemStatus } from '$lib/beszel';

  let { children } = $props();

  // Pull `systems` off the current page's load data when present. The fleet
  // route returns it; the per-host route doesn't, so this is undefined there.
  const systems = $derived(
    (page.data as { systems?: SystemRow[] }).systems
  );

  const counts = $derived(
    systems
      ? systems.reduce(
          (acc, s) => {
            acc.total += 1;
            acc[s.status] = (acc[s.status] ?? 0) + 1;
            return acc;
          },
          { total: 0 } as Record<SystemStatus | 'total', number>,
        )
      : undefined,
  );

  // On the per-host page, surface a back link instead of fleet counts.
  const onHostPage = $derived(page.route.id === '/hosts/[slug]');
</script>

<div class="shell">
  <header class="top">
    <div class="lead">
      <a class="brand" href="/" aria-label="analytics — fleet">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-text">analytics</span>
      </a>

      {#if counts}
        <div class="pulse" role="status" aria-live="polite">
          <span class="pulse-total">{counts.total}</span>
          <span class="pulse-sep" aria-hidden="true">·</span>
          <span class="pulse-stat ok">
            <span class="pip" aria-hidden="true"></span>
            <span class="num">{counts.up ?? 0}</span>
            <span class="lbl">up</span>
          </span>
          {#if (counts.down ?? 0) > 0}
            <span class="pulse-stat down">
              <span class="pip" aria-hidden="true"></span>
              <span class="num">{counts.down}</span>
              <span class="lbl">down</span>
            </span>
          {/if}
          {#if ((counts.paused ?? 0) + (counts.pending ?? 0)) > 0}
            <span class="pulse-stat dim">
              <span class="pip" aria-hidden="true"></span>
              <span class="num">{(counts.paused ?? 0) + (counts.pending ?? 0)}</span>
              <span class="lbl">idle</span>
            </span>
          {/if}
        </div>
      {:else if onHostPage}
        <a class="back" href="/" aria-label="Back to fleet">
          <span aria-hidden="true">←</span>
          <span>fleet</span>
        </a>
      {/if}
    </div>

    <TimeRangeToggle />
  </header>

  <main>
    {@render children?.()}
  </main>
</div>

<style>
  :global(a) {
    color: var(--accent);
    text-decoration: none;
  }

  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    /* A near-imperceptible top vignette gives the header something to sit on. */
    background:
      radial-gradient(
        140% 80% at 50% -10%,
        rgba(217, 119, 87, 0.05),
        transparent 60%
      ),
      var(--bg-page);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.25rem;
    padding: 0.875rem 1.5rem;
    background: linear-gradient(
      to bottom,
      rgba(22, 22, 22, 0.92),
      rgba(22, 22, 22, 0.72)
    );
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border-soft);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .lead {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    min-width: 0;
    flex: 1;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--fg-strong);
    font-weight: 600;
    letter-spacing: -0.01em;
    font-size: 0.95rem;
    padding: 0.25rem 0;
  }

  .brand-mark {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 2px;
    background: var(--accent);
    box-shadow: 0 0 12px 0 color-mix(in srgb, var(--accent) 60%, transparent);
    transform: rotate(45deg);
  }

  .brand-text {
    /* Inter Tight is at home here — push the tracking in a hair. */
    font-feature-settings: 'tnum' 1, 'ss01' 1;
  }

  .pulse {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.3rem 0.7rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-soft);
    background: color-mix(in srgb, var(--bg-elevated) 60%, transparent);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--fg-primary);
    min-height: 1.875rem;
  }

  .pulse-total {
    color: var(--fg-strong);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .pulse-sep {
    color: var(--fg-muted);
    opacity: 0.5;
  }

  .pulse-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .pulse-stat .pip {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .pulse-stat.ok .pip {
    background: var(--success);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--success) 60%, transparent);
    animation: live-pulse 2.4s ease-in-out infinite;
  }

  .pulse-stat.down .pip {
    background: var(--error);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--error) 65%, transparent);
  }

  .pulse-stat.dim .pip {
    background: var(--fg-muted);
    opacity: 0.7;
  }

  .pulse-stat .num {
    color: var(--fg-strong);
    font-weight: 500;
  }

  .pulse-stat .lbl {
    color: var(--fg-muted);
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--fg-primary);
    font-size: 0.8125rem;
    padding: 0.3rem 0.6rem;
    border-radius: var(--radius-small);
    transition: color var(--motion-fast) var(--ease),
                background var(--motion-fast) var(--ease);
  }

  .back:hover {
    color: var(--fg-strong);
    background: color-mix(in srgb, var(--bg-elevated) 50%, transparent);
  }

  main {
    flex: 1;
    padding: 1.25rem 1.5rem 2rem;
    max-width: 1480px;
    width: 100%;
    margin: 0 auto;
  }

  @keyframes live-pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.55;
      transform: scale(0.85);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse-stat.ok .pip {
      animation: none;
    }
  }

  @media (max-width: 720px) {
    .top {
      padding: 0.75rem 1rem;
      gap: 0.75rem;
    }
    main {
      padding: 0.875rem 1rem 1.5rem;
    }
    .lead {
      gap: 0.75rem;
    }
    .pulse {
      padding: 0.25rem 0.5rem;
      gap: 0.5rem;
    }
    .pulse-stat .lbl {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .pulse-total {
      display: none;
    }
    .pulse-sep {
      display: none;
    }
  }
</style>
