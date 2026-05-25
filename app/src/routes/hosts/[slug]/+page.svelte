<!-- Per-host view: identity hero with metric ribbon, then a grid of panels.
     CPU runs full-width as the centerpiece chart, Memory and Disk share a row
     below, Network closes the loop full-width, and Containers (if any) sits at
     the bottom as a denser table. -->
<script lang="ts">
  import HostMeta from '$lib/panels/HostMeta.svelte';
  import CpuPanel from '$lib/panels/CpuPanel.svelte';
  import MemoryPanel from '$lib/panels/MemoryPanel.svelte';
  import DiskPanel from '$lib/panels/DiskPanel.svelte';
  import NetworkPanel from '$lib/panels/NetworkPanel.svelte';
  import ContainersPanel from '$lib/panels/ContainersPanel.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const latest = $derived(
    data.samples.length > 0 ? data.samples[data.samples.length - 1] : undefined,
  );
</script>

<div class="page">
  <HostMeta
    system={data.system}
    details={data.systemDetails}
    {latest}
    lastSeenMs={latest?.timestamp}
  />

  <div class="grid">
    <div class="cell full" style:--cell-index={0}>
      <CpuPanel
        samples={data.samples}
        currentPct={latest?.cpuPct}
        loadAvg={data.system.loadAvg}
      />
    </div>
    <div class="cell" style:--cell-index={1}>
      <MemoryPanel
        samples={data.samples}
        currentPct={latest?.memPct}
        memoryBytes={data.systemDetails.memoryBytes}
      />
    </div>
    <div class="cell" style:--cell-index={2}>
      <DiskPanel
        samples={data.samples}
        {latest}
      />
    </div>
    <div class="cell full" style:--cell-index={3}>
      <NetworkPanel
        samples={data.samples}
        currentReadBps={latest?.netRecvBps}
        currentSentBps={latest?.netSentBps}
      />
    </div>
    {#if data.containers.length > 0}
      <div class="cell full" style:--cell-index={4}>
        <ContainersPanel containers={data.containers} />
      </div>
    {/if}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    container-type: inline-size;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .cell {
    min-width: 0;
    animation: cell-enter 360ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
    animation-delay: calc(var(--cell-index, 0) * 60ms + 80ms);
  }
  .cell.full {
    grid-column: 1 / -1;
  }

  /* Container query: when the main pane is too narrow for two columns,
     stack. Viewport-based breakpoints don't work here because the sidebar
     pinches the main pane on its own. */
  @container (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .cell.full {
      grid-column: auto;
    }
  }

  @keyframes cell-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cell {
      animation: none;
    }
  }

  @container (max-width: 720px) {
    .grid {
      gap: 0.75rem;
    }
  }
</style>
