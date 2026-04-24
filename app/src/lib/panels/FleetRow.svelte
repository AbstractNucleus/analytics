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

  const cpu = $derived(latest?.cpuPct ?? NaN);
  const mem = $derived(latest?.memPct ?? NaN);
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
    padding: 0.5rem 1rem;
    background: var(--sub-alt);
    color: var(--text-regular);
    font-variant-numeric: tabular-nums;
  }
  .status-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--text-regular);
  }
  .status-dot[data-status='up'] {
    background: var(--accent);
  }
  .status-dot[data-status='down'] {
    background: #7a1f1f;
  }
  .status-dot[data-status='paused'] {
    background: var(--text-regular);
    opacity: 0.6;
  }
  .name {
    font-weight: var(--weight-medium);
    color: var(--text-bold);
  }
  .metric .k {
    font-size: 0.7rem;
    color: var(--text-regular);
    opacity: 0.65;
    margin-right: 0.25rem;
  }
  .metric .v {
    color: var(--text-bold);
    font-weight: var(--weight-medium);
  }
  .last-seen {
    font-size: 0.8rem;
    color: var(--text-regular);
    opacity: 0.8;
  }
</style>
