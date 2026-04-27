<!-- Per-host identity strip: hostname + status, last-seen, and a property
     grid of OS / kernel / CPU / memory / uptime / containers. Replaces the
     thin <HostHeader> + <UptimeKernel> pair so identity lives in one place. -->
<script lang="ts">
  import { formatRelativeTime, formatTabular, formatUptime } from '$lib/format';
  import type { SystemRow, SystemDetails } from '$lib/beszel';

  type Props = {
    system: SystemRow;
    details: SystemDetails;
    lastSeenMs?: number;
    /** nowMs is only for deterministic testing; app callers leave it undefined. */
    nowMs?: number;
  };

  const { system, details, lastSeenMs, nowMs }: Props = $props();

  const BYTES_PER_GB = 1024 * 1024 * 1024;

  const memoryGb = $derived(details.memoryBytes / BYTES_PER_GB);
  const osArch = $derived(
    [details.osName, details.arch].filter((s) => s && s.length > 0).join(' · ')
  );
  const cpuLine = $derived(
    details.cpu
      ? `${details.cpu}${details.cores ? ` · ${details.cores}c/${details.threads}t` : ''}`
      : ''
  );
</script>

<section class="meta" aria-label="Host details">
  <div class="title">
    <span class="status-dot" data-status={system.status} aria-label={system.status}></span>
    <h1>{system.name}</h1>
    {#if lastSeenMs !== undefined}
      <span class="last-seen">{formatRelativeTime(lastSeenMs, nowMs)}</span>
    {/if}
  </div>

  <dl class="props">
    {#if osArch}
      <div>
        <dt>OS</dt>
        <dd>{osArch}</dd>
      </div>
    {/if}
    {#if details.kernel}
      <div>
        <dt>Kernel</dt>
        <dd class="mono">{details.kernel}</dd>
      </div>
    {/if}
    {#if cpuLine}
      <div class="span2">
        <dt>CPU</dt>
        <dd>{cpuLine}</dd>
      </div>
    {/if}
    {#if details.memoryBytes > 0}
      <div>
        <dt>Memory</dt>
        <dd>{formatTabular(memoryGb, { decimals: 0, suffix: 'GB' })}</dd>
      </div>
    {/if}
    <div>
      <dt>Uptime</dt>
      <dd>{formatUptime(system.uptimeSeconds)}</dd>
    </div>
    {#if system.containerCount > 0}
      <div>
        <dt>Containers</dt>
        <dd>{system.containerCount}</dd>
      </div>
    {/if}
    {#if system.agentVersion}
      <div>
        <dt>Agent</dt>
        <dd class="mono">{system.agentVersion}</dd>
      </div>
    {/if}
  </dl>
</section>

<style>
  .meta {
    background: var(--sub-alt);
    padding: 1rem 1.125rem 1.125rem;
    color: var(--text-regular);
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    row-gap: 0.25rem;
  }
  h1 {
    margin: 0;
    font-size: 1.375rem;
    font-weight: var(--weight-bold);
    color: var(--text-bold);
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .status-dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--text-regular);
    flex-shrink: 0;
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
  .status-dot[data-status='pending'] {
    background: var(--text-medium);
    opacity: 0.5;
  }
  .last-seen {
    margin-left: auto;
    font-size: 0.8125rem;
    color: var(--text-regular);
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }
  .props {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.625rem 1.5rem;
    font-variant-numeric: tabular-nums;
  }
  .props > div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .props > div.span2 {
    grid-column: span 2;
  }
  @media (max-width: 600px) {
    .meta {
      padding: 0.875rem 1rem 1rem;
    }
    h1 {
      font-size: 1.125rem;
    }
    .props {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem 1rem;
    }
    .props > div.span2 {
      grid-column: span 2;
    }
  }
  @media (max-width: 360px) {
    .props {
      grid-template-columns: 1fr;
    }
    .props > div.span2 {
      grid-column: auto;
    }
  }
  dt {
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-regular);
    opacity: 0.6;
  }
  dd {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--text-bold);
    font-weight: var(--weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  dd.mono {
    font-size: 0.875rem;
  }
</style>
