<!-- Per-host view: stacked header + the six panels against the loaded data.
     Memory total, kernel, and OS come from SystemDetails. Disk total comes
     from the latest StatsSample (system_details doesn't carry a disk field). -->
<script lang="ts">
  import HostHeader from '$lib/panels/HostHeader.svelte';
  import CpuPanel from '$lib/panels/CpuPanel.svelte';
  import MemoryPanel from '$lib/panels/MemoryPanel.svelte';
  import DiskPanel from '$lib/panels/DiskPanel.svelte';
  import NetworkPanel from '$lib/panels/NetworkPanel.svelte';
  import UptimeKernel from '$lib/panels/UptimeKernel.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const latest = $derived(
    data.samples.length > 0 ? data.samples[data.samples.length - 1] : undefined,
  );
</script>

<HostHeader system={data.system} lastSeenMs={latest?.timestamp} />

<div class="stack">
  <CpuPanel samples={data.samples} currentPct={latest?.cpuPct} />
  <MemoryPanel currentPct={latest?.memPct} memoryBytes={data.systemDetails.memoryBytes} />
  <DiskPanel currentPct={latest?.diskPct} diskTotalGb={latest?.diskTotalGb} />
  <NetworkPanel
    samples={data.samples}
    currentReadBps={latest?.netRecvBps}
    currentSentBps={latest?.netSentBps}
  />
  <UptimeKernel
    uptimeSeconds={data.system.uptimeSeconds}
    kernel={data.systemDetails.kernel}
    osName={data.systemDetails.osName}
  />
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
</style>
