<!-- Per-host view: identity strip on top, full-width CPU, a Mem/Disk pair,
     full-width Network. Memory total / kernel / OS / cpu descriptor come from
     SystemDetails; disk total comes from the latest StatsSample. -->
<script lang="ts">
  import HostMeta from '$lib/panels/HostMeta.svelte';
  import CpuPanel from '$lib/panels/CpuPanel.svelte';
  import MemoryPanel from '$lib/panels/MemoryPanel.svelte';
  import DiskPanel from '$lib/panels/DiskPanel.svelte';
  import NetworkPanel from '$lib/panels/NetworkPanel.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const latest = $derived(
    data.samples.length > 0 ? data.samples[data.samples.length - 1] : undefined,
  );
</script>

<HostMeta system={data.system} details={data.systemDetails} lastSeenMs={latest?.timestamp} />

<div class="grid">
  <div class="cell full">
    <CpuPanel
      samples={data.samples}
      currentPct={latest?.cpuPct}
      loadAvg={data.system.loadAvg}
    />
  </div>
  <div class="cell">
    <MemoryPanel
      samples={data.samples}
      currentPct={latest?.memPct}
      memoryBytes={data.systemDetails.memoryBytes}
    />
  </div>
  <div class="cell">
    <DiskPanel
      samples={data.samples}
      currentPct={latest?.diskPct}
      diskTotalGb={latest?.diskTotalGb}
    />
  </div>
  <div class="cell full">
    <NetworkPanel
      samples={data.samples}
      currentReadBps={latest?.netRecvBps}
      currentSentBps={latest?.netSentBps}
    />
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .cell {
    min-width: 0;
  }
  .cell.full {
    grid-column: 1 / -1;
  }
  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .cell.full {
      grid-column: auto;
    }
  }
</style>
