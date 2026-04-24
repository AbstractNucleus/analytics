<!-- Per-host view: stacked header + all six panels against the loaded data. -->
<script lang="ts">
  import HostHeader from '$lib/panels/HostHeader.svelte';
  import CpuPanel from '$lib/panels/CpuPanel.svelte';
  import MemoryPanel from '$lib/panels/MemoryPanel.svelte';
  import DiskPanel from '$lib/panels/DiskPanel.svelte';
  import NetworkPanel from '$lib/panels/NetworkPanel.svelte';
  import TempsPanel from '$lib/panels/TempsPanel.svelte';
  import UptimeKernel from '$lib/panels/UptimeKernel.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const latest = $derived(
    data.samples.length > 0 ? data.samples[data.samples.length - 1] : undefined
  );
</script>

<HostHeader system={data.system} lastSeenMs={latest?.timestamp} />

<div class="stack">
  <CpuPanel samples={data.samples} currentPct={latest?.cpuPct} />
  <MemoryPanel currentPct={latest?.memPct} memGb={data.system.memGb} />
  <DiskPanel currentPct={latest?.diskPct} diskTotalGb={data.system.diskTotalGb} />
  <NetworkPanel
    samples={data.samples}
    currentReadBps={latest?.netReadBps}
    currentSentBps={latest?.netSentBps}
  />
  <TempsPanel temps={latest?.temps ?? {}} />
  <UptimeKernel system={data.system} />
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
</style>
