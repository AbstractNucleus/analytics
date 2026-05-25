<!-- Single-line fleet summary: status sliver, host name, CPU and memory meters
     with inline progress bars, last-seen relative time, and a trailing chevron
     that reveals on hover to telegraph the link affordance.

     The row is itself the link element when `href` is provided — wrapping it
     in an outer <a> would put the hover/focus pseudo state on a different
     scoped subtree and the rail/chevron transitions would not compose. When
     `href` is absent the row renders as an <article> for isolation tests. -->
<script lang="ts">
  import { formatPercent, formatRelativeTime, formatUptime } from '$lib/format';
  import type { StatsSample, SystemRow } from '$lib/beszel';

  type Props = {
    system: SystemRow;
    latest?: StatsSample;
    lastSeenMs?: number;
    nowMs?: number;
    href?: string;
  };

  const { system, latest, lastSeenMs, nowMs, href }: Props = $props();

  function metric(override: number | undefined, fallback: number): number {
    if (override !== undefined) return override;
    if (system.status === 'pending') return NaN;
    if (!Number.isFinite(system.lastSeenMs)) return NaN;
    return fallback;
  }

  const cpu = $derived(metric(latest?.cpuPct, system.cpuPct));
  const mem = $derived(metric(latest?.memPct, system.memPct));

  // Bar widths clamp to [0, 100]; NaN renders an empty track.
  const cpuBar = $derived(Number.isFinite(cpu) ? Math.max(0, Math.min(100, cpu)) : 0);
  const memBar = $derived(Number.isFinite(mem) ? Math.max(0, Math.min(100, mem)) : 0);

  // Hot-band tinting: a CPU at 95% should feel hotter than at 20%. Stays
  // muted at low values so the row reads calm by default.
  function heat(v: number): 'cool' | 'warm' | 'hot' {
    if (!Number.isFinite(v)) return 'cool';
    if (v >= 85) return 'hot';
    if (v >= 60) return 'warm';
    return 'cool';
  }
  const cpuHeat = $derived(heat(cpu));
  const memHeat = $derived(heat(mem));

  const uptime = $derived(
    system.uptimeSeconds > 0 ? formatUptime(system.uptimeSeconds) : '',
  );

  const tag = $derived(href ? 'a' : 'article');
</script>

<svelte:element
  this={tag}
  class="fleet-row"
  data-slug={system.slug}
  data-status={system.status}
  href={href}
>
  <span class="rail" aria-hidden="true"></span>

  <span class="identity">
    <span class="status-dot" data-status={system.status} aria-label={system.status}></span>
    <span class="name">{system.name}</span>
    {#if uptime}
      <span class="uptime" title="Uptime">{uptime}</span>
    {/if}
    {#if system.containerCount > 0}
      <span class="containers" title="Containers">
        <span class="containers-glyph" aria-hidden="true"></span>
        {system.containerCount}
      </span>
    {/if}
  </span>

  <span class="meter cpu" data-heat={cpuHeat}>
    <span class="meter-label">CPU</span>
    <span class="meter-value">{formatPercent(cpu, 1)}</span>
    <span class="meter-track" aria-hidden="true">
      <span class="meter-fill" style:width="{cpuBar}%"></span>
    </span>
  </span>

  <span class="meter mem" data-heat={memHeat}>
    <span class="meter-label">MEM</span>
    <span class="meter-value">{formatPercent(mem, 1)}</span>
    <span class="meter-track" aria-hidden="true">
      <span class="meter-fill" style:width="{memBar}%"></span>
    </span>
  </span>

  <span class="last-seen">
    {lastSeenMs !== undefined ? formatRelativeTime(lastSeenMs, nowMs) : '—'}
  </span>

  <span class="chevron" aria-hidden="true">→</span>
</svelte:element>

<style>
  .fleet-row {
    position: relative;
    display: grid;
    grid-template-columns:
      minmax(0, 1fr)        /* identity */
      minmax(8.5rem, 11rem) /* CPU meter */
      minmax(8.5rem, 11rem) /* MEM meter */
      auto                  /* last-seen */
      1rem;                 /* chevron */
    align-items: center;
    column-gap: 1.5rem;
    padding: 0.875rem 1.125rem 0.875rem 1.5rem;
    background: var(--bg-surface);
    color: var(--fg-primary);
    font-variant-numeric: tabular-nums;
    min-height: 3.25rem;
    border-top: 1px solid var(--border-soft);
    text-decoration: none;
    transition:
      background var(--motion-fast) var(--ease);
  }
  .fleet-row:first-child {
    border-top: none;
  }

  /* Make this a link with no underline; color inherits. */
  a.fleet-row {
    color: var(--fg-primary);
    cursor: pointer;
  }

  /* Hover / focus reveal --------------------------------------------------- */
  a.fleet-row:hover,
  a.fleet-row:focus-visible {
    background: var(--bg-surface-hover);
  }
  a.fleet-row:focus-visible {
    outline: none;
    box-shadow:
      inset 2px 0 0 0 var(--accent),
      inset 0 0 0 1px var(--border-strong);
  }
  a.fleet-row:hover .rail,
  a.fleet-row:focus-visible .rail {
    width: 5px;
    opacity: 1;
  }
  a.fleet-row:hover .chevron,
  a.fleet-row:focus-visible .chevron {
    opacity: 1;
    transform: translateX(0);
    color: var(--accent);
  }
  a.fleet-row:hover .name,
  a.fleet-row:focus-visible .name {
    color: var(--fg-strong);
  }

  /* Left status rail. Width animates from 3px → 5px on hover. */
  .rail {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--fg-muted);
    opacity: 0.4;
    transition:
      width var(--motion-fast) var(--ease),
      opacity var(--motion-fast) var(--ease),
      background var(--motion-fast) var(--ease);
  }
  .fleet-row[data-status='up'] .rail {
    background: var(--success);
    opacity: 0.55;
  }
  .fleet-row[data-status='down'] .rail {
    background: var(--error);
    opacity: 0.8;
  }
  .fleet-row[data-status='paused'] .rail,
  .fleet-row[data-status='pending'] .rail {
    background: var(--fg-muted);
    opacity: 0.3;
  }

  /* Identity cluster (left) ----------------------------------------------- */
  .identity {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--fg-primary);
    flex-shrink: 0;
  }
  .status-dot[data-status='up'] {
    background: var(--success);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 50%, transparent);
    animation: pip-pulse 3s ease-in-out infinite;
  }
  .status-dot[data-status='down'] {
    background: var(--error);
    box-shadow: 0 0 8px 0 color-mix(in srgb, var(--error) 55%, transparent);
  }
  .status-dot[data-status='paused'],
  .status-dot[data-status='pending'] {
    background: var(--fg-muted);
    opacity: 0.6;
  }

  .name {
    font-weight: 500;
    color: var(--fg-strong);
    font-size: 0.9375rem;
    letter-spacing: -0.005em;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--motion-fast) var(--ease);
  }

  .uptime,
  .containers {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-small);
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
    border: 1px solid var(--border-soft);
    color: var(--fg-muted);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .containers-glyph {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 1px;
    background: var(--fg-muted);
    opacity: 0.7;
  }

  /* Meter cluster (CPU / MEM) -------------------------------------------- */
  .meter {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 0.5rem;
    row-gap: 0.25rem;
    align-items: baseline;
  }

  .meter-label {
    grid-column: 1;
    grid-row: 1;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-muted);
    font-weight: 500;
  }

  .meter-value {
    grid-column: 2;
    grid-row: 1;
    color: var(--fg-strong);
    font-weight: 500;
    font-size: 0.875rem;
    text-align: right;
    transition: color var(--motion-fast) var(--ease);
  }

  .meter-track {
    grid-column: 1 / -1;
    grid-row: 2;
    position: relative;
    height: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg-muted) 18%, transparent);
    overflow: hidden;
  }

  .meter-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--fg-muted);
    border-radius: inherit;
    transition: width var(--motion-med) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .meter[data-heat='cool'] .meter-fill {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--fg-primary) 50%, transparent),
      color-mix(in srgb, var(--fg-strong) 70%, transparent)
    );
  }
  .meter[data-heat='warm'] .meter-fill {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--accent) 55%, transparent),
      var(--accent)
    );
    box-shadow: 0 0 4px 0 color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .meter[data-heat='warm'] .meter-value {
    color: var(--accent);
  }
  .meter[data-heat='hot'] .meter-fill {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--accent) 60%, transparent),
      var(--status)
    );
    box-shadow: 0 0 8px 0 color-mix(in srgb, var(--status) 50%, transparent);
  }
  .meter[data-heat='hot'] .meter-value {
    color: var(--status);
  }

  /* Last-seen + chevron -------------------------------------------------- */
  .last-seen {
    font-size: 0.8125rem;
    color: var(--fg-muted);
    white-space: nowrap;
    text-align: right;
  }

  .chevron {
    font-size: 0.95rem;
    color: var(--fg-muted);
    opacity: 0;
    transform: translateX(-4px);
    transition:
      opacity var(--motion-fast) var(--ease),
      transform var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease);
  }

  /* Motion --------------------------------------------------------------- */
  @keyframes pip-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 50%, transparent);
    }
    70% {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--success) 0%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 0%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-dot[data-status='up'] {
      animation: none;
    }
    .rail,
    .chevron,
    .meter-fill,
    .fleet-row {
      transition: none;
    }
  }

  /* Responsive ----------------------------------------------------------- */
  @media (max-width: 900px) {
    .fleet-row {
      grid-template-columns:
        minmax(0, 1fr)
        minmax(6.5rem, 8.5rem)
        minmax(6.5rem, 8.5rem)
        auto
        0.75rem;
      column-gap: 1rem;
      padding: 0.75rem 0.875rem 0.75rem 1.125rem;
    }
    .uptime,
    .containers {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .fleet-row {
      grid-template-columns:
        auto
        minmax(0, 1fr)
        auto;
      grid-template-rows: auto auto;
      column-gap: 0.625rem;
      row-gap: 0.5rem;
      padding: 0.75rem 0.875rem 0.75rem 1rem;
    }
    .identity {
      grid-column: 1 / 3;
      grid-row: 1;
    }
    .last-seen {
      grid-column: 3;
      grid-row: 1;
    }
    .chevron {
      display: none;
    }
    .meter.cpu {
      grid-column: 1 / 2;
      grid-row: 2;
    }
    .meter.mem {
      grid-column: 2 / 4;
      grid-row: 2;
    }
  }
</style>
