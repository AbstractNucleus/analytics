<!-- Page-level host identity: hostname, status dot, relative last-seen. -->
<script lang="ts">
  import { formatRelativeTime } from '$lib/format';
  import type { SystemRow } from '$lib/beszel';

  type Props = {
    system: SystemRow;
    lastSeenMs?: number;
    // nowMs is only for deterministic testing; app callers leave it undefined.
    nowMs?: number;
  };

  const { system, lastSeenMs, nowMs }: Props = $props();
</script>

<header class="host-header">
  <span class="status-dot" data-status={system.status} aria-label={system.status}></span>
  <h1>{system.name}</h1>
  {#if lastSeenMs !== undefined}
    <span class="last-seen">{formatRelativeTime(lastSeenMs, nowMs)}</span>
  {/if}
</header>

<style>
  .host-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg);
    color: var(--text-bold);
  }
  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: var(--weight-bold);
    color: var(--text-bold);
  }
  .status-dot {
    width: 0.6rem;
    height: 0.6rem;
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
  .last-seen {
    margin-left: auto;
    font-size: 0.875rem;
    color: var(--text-regular);
    font-variant-numeric: tabular-nums;
  }
</style>
