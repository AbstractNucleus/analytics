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
    { label: 'Memory', stroke: 'var(--accent)', fill: 'rgba(194, 65, 12, 0.18)', width: 2 }
  ];
</script>

<section class="panel" aria-label="Memory">
  <header>
    <h3>Memory</h3>
    <span class="readout">{formatPercent(pct, 1)}</span>
  </header>
  <p class="sub">
    <span class="used">{formatTabular(used, { decimals: 1, suffix: 'GB' })}</span>
    <span class="sep"> / </span>
    <span class="total">{formatTabular(totalGb, { decimals: 0, suffix: 'GB' })}</span>
  </p>
  {#if hasChart}
    <TimeSeries {data} {series} {height} yRange={[0, 100]} formatY={(v) => formatPercent(v, 0)} />
  {/if}
</section>

<style>
  .panel {
    background: var(--sub-alt);
    padding: 0.875rem 1rem 1rem;
    color: var(--text-regular);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h3 {
    font-weight: var(--weight-medium);
    font-size: 0.8125rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0;
    color: var(--text-medium);
    opacity: 0.8;
  }
  .readout {
    font-weight: var(--weight-bold);
    color: var(--text-bold);
    font-variant-numeric: tabular-nums;
    font-size: 1.375rem;
    line-height: 1;
  }
  .sub {
    margin: 0;
    color: var(--text-regular);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .sep {
    color: var(--text-regular);
    opacity: 0.5;
  }
</style>
