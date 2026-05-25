<!-- One row in the sidebar host list. Active highlight is driven by the
     `active` prop so the parent can compute it from the current URL and we
     don't have to plumb $app/state into the row component. -->
<script lang="ts">
  import { formatPercent } from '$lib/format';
  import type { SystemRow } from '$lib/beszel';

  type Props = {
    system: SystemRow;
    active: boolean;
  };

  const { system, active }: Props = $props();

  const cpu = $derived(
    system.status === 'pending' || !Number.isFinite(system.lastSeenMs)
      ? NaN
      : system.cpuPct,
  );
  const cpuBar = $derived(
    Number.isFinite(cpu) ? Math.max(0, Math.min(100, cpu)) : 0,
  );
  const hot = $derived(Number.isFinite(cpu) && cpu >= 85);
</script>

<a
  class="row"
  class:active
  class:hot
  data-status={system.status}
  href="/hosts/{system.slug}"
>
  <span class="rail" aria-hidden="true"></span>
  <span class="pip" data-status={system.status} aria-label={system.status}></span>
  <span class="name">{system.name}</span>
  <span class="cpu">{formatPercent(cpu, 0)}</span>
  <span class="bar" aria-hidden="true">
    <span class="bar-fill" style:width="{cpuBar}%"></span>
  </span>
</a>

<style>
  .row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 0.5rem;
    row-gap: 0.2rem;
    padding: 0.45rem 0.625rem 0.45rem 0.875rem;
    border-radius: var(--radius-small);
    color: var(--fg-primary);
    text-decoration: none;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    transition:
      background var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease);
  }
  .row:hover {
    background: color-mix(in srgb, var(--bg-elevated) 60%, transparent);
    color: var(--fg-strong);
  }
  .row.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--fg-strong);
  }
  .row.active .name {
    color: var(--fg-strong);
  }
  .row:focus-visible {
    outline: none;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  /* Left rail — visible only when active. Picks up status color. */
  .rail {
    position: absolute;
    inset: 0.45rem auto 0.45rem 0;
    width: 2px;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease);
  }
  .row.active .rail {
    opacity: 1;
  }
  .row[data-status='down'] .rail {
    background: var(--error);
  }

  .pip {
    grid-column: 1;
    grid-row: 1;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--fg-muted);
    flex-shrink: 0;
  }
  .pip[data-status='up'] {
    background: var(--success);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 50%, transparent);
    animation: sidebar-pip 3s ease-in-out infinite;
  }
  .pip[data-status='down'] {
    background: var(--error);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--error) 55%, transparent);
  }
  .pip[data-status='paused'],
  .pip[data-status='pending'] {
    background: var(--fg-muted);
    opacity: 0.55;
  }

  .name {
    grid-column: 2;
    grid-row: 1;
    color: var(--fg-strong);
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cpu {
    grid-column: 3;
    grid-row: 1;
    color: var(--fg-muted);
    font-size: 0.7rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    transition: color var(--motion-fast) var(--ease);
  }
  .row.hot .cpu {
    color: var(--status);
  }

  /* Mini bar spans columns 2 + 3 under the name. */
  .bar {
    grid-column: 2 / 4;
    grid-row: 2;
    position: relative;
    height: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg-muted) 18%, transparent);
    overflow: hidden;
  }
  .bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--fg-primary) 55%, transparent);
    border-radius: inherit;
    transition: width var(--motion-med) cubic-bezier(0.4, 0, 0.2, 1);
  }
  .row.hot .bar-fill {
    background: var(--status);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--status) 50%, transparent);
  }
  .row.active .bar-fill {
    background: var(--accent);
  }

  @keyframes sidebar-pip {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 50%, transparent);
    }
    70% {
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--success) 0%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 0%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pip[data-status='up'] {
      animation: none;
    }
    .row,
    .bar-fill,
    .rail {
      transition: none;
    }
  }
</style>
