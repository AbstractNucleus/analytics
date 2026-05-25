<!-- Current memory % plus a used-of-total GB readout and a usage sparkline. -->
<script lang="ts">
  import { TimeSeries } from '$lib/chart';
  import { formatPercent, formatTabular } from '$lib/format';
  import type { StatsSample } from '$lib/beszel';

  type Props = {
    currentPct?: number;
    /** Total memory in bytes (as reported by system_details.memory). */
    memoryBytes: number;
    samples?: StatsSample[];
    height?: number;
  };

  const { currentPct, memoryBytes, samples = [], height = 120 }: Props = $props();

  const BYTES_PER_GB = 1024 * 1024 * 1024;

  const pct = $derived(currentPct ?? NaN);
  const totalGb = $derived(memoryBytes / BYTES_PER_GB);
  const used = $derived(Number.isFinite(pct) ? (pct / 100) * totalGb : NaN);
  const hasChart = $derived(samples.length > 1);

  const data = $derived<[number[], number[]]>([
    samples.map((s) => Math.floor(s.timestamp / 1000)),
    samples.map((s) => s.memPct)
  ]);

  const series = [
    {},
    { label: 'Memory', stroke: 'var(--accent)', fill: 'var(--accent-soft)', width: 2 }
  ];
</script>

<section class="panel" aria-label="Memory">
  <header class="panel-header">
    <h3 class="panel-title">Memory</h3>
    <span class="panel-readout">{formatPercent(pct, 1)}</span>
  </header>
  <p class="sub">
    <span class="used">{formatTabular(used, { decimals: 1 })}</span>
    <span class="sep">/</span>
    <span class="total">{formatTabular(totalGb, { decimals: 0, suffix: 'GB' })}</span>
  </p>
  {#if hasChart}
    <TimeSeries {data} {series} {height} yRange={[0, 100]} formatY={(v) => formatPercent(v, 0)} />
  {/if}
</section>

<style>
  .sub {
    margin: 0;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
  }
  .used {
    color: var(--fg-primary);
  }
  .sep {
    margin: 0 0.2rem;
    opacity: 0.5;
  }
</style>
