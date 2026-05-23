<!-- Single-line fleet summary: name, status dot, cpu %, mem %, last-seen. -->
<script lang="ts">
  import { formatPercent, formatRelativeTime } from '$lib/format';
  import type { StatsSample, SystemRow } from '$lib/beszel';

  type Props = {
    system: SystemRow;
    latest?: StatsSample;
    lastSeenMs?: number;
    nowMs?: number;
  };

  const { system, latest, lastSeenMs, nowMs }: Props = $props();

  function metric(override: number | undefined, fallback: number): number {
    if (override !== undefined) return override;
    if (system.status === 'pending') return NaN;
    if (!Number.isFinite(system.lastSeenMs)) return NaN;
    return fallback;
  }

  const cpu = $derived(metric(latest?.cpuPct, system.cpuPct));
  const mem = $derived(metric(latest?.memPct, system.memPct));
</script>

<article class="fleet-row" data-slug={system.slug}>
  <span class="status-dot" data-status={system.status} aria-label={system.status}></span>
  <span class="name">{system.name}</span>
  <span class="metric cpu">
    <span class="k">CPU</span> <span class="v">{formatPercent(cpu, 1)}</span>
  </span>
  <span class="metric mem">
    <span class="k">MEM</span> <span class="v">{formatPercent(mem, 1)}</span>
  </span>
  <span class="last-seen">
    {lastSeenMs !== undefined ? formatRelativeTime(lastSeenMs, nowMs) : '—'}
  </span>
</article>

<style>
  .fleet-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    align-items: center;
    gap: 1rem;
    padding: 0.625rem 1rem;
    background: var(--bg-surface);
    color: var(--fg-primary);
    font-variant-numeric: tabular-nums;
    min-height: 2.75rem;
  }
  .status-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--fg-primary);
    flex-shrink: 0;
  }
  .status-dot[data-status='up'] {
    background: var(--success);
  }
  .status-dot[data-status='down'] {
    background: var(--error);
  }
  .status-dot[data-status='paused'] {
    background: var(--fg-primary);
    opacity: 0.6;
  }
  .status-dot[data-status='pending'] {
    background: var(--fg-primary);
    opacity: 0.5;
  }
  .name {
    font-weight: 500;
    color: var(--fg-strong);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .metric .k {
    font-size: 0.7rem;
    color: var(--fg-primary);
    opacity: 0.65;
    margin-right: 0.25rem;
  }
  .metric .v {
    color: var(--fg-strong);
    font-weight: 500;
  }
  .last-seen {
    font-size: 0.8rem;
    color: var(--fg-primary);
    opacity: 0.8;
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    .fleet-row {
      grid-template-columns: auto 1fr auto auto;
      gap: 0.625rem;
      padding: 0.625rem 0.75rem;
    }
    .last-seen {
      grid-column: 2 / -1;
      font-size: 0.75rem;
      opacity: 0.7;
      padding-top: 0.125rem;
    }
    .metric .k {
      display: none;
    }
  }
</style>
