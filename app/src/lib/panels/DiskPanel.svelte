<!-- Current disk usage % plus used-of-total GB and a usage sparkline. -->
<script lang="ts">
  import { TimeSeries } from '$lib/chart';
  import { formatPercent, formatTabular } from '$lib/format';
  import type { StatsSample } from '$lib/beszel';

  type Props = {
    currentPct?: number;
    diskTotalGb?: number;
    samples?: StatsSample[];
    height?: number;
  };

  const { currentPct, diskTotalGb, samples = [], height = 120 }: Props = $props();

  const pct = $derived(currentPct ?? NaN);
  const used = $derived(
    diskTotalGb !== undefined && Number.isFinite(pct) ? (pct / 100) * diskTotalGb : NaN
  );
  const hasChart = $derived(samples.length > 1);

  const data = $derived<[number[], number[]]>([
    samples.map((s) => Math.floor(s.timestamp / 1000)),
    samples.map((s) => s.diskPct)
  ]);

  const series = [
    {},
    { label: 'Disk', stroke: 'var(--accent)', fill: 'rgba(194, 65, 12, 0.18)', width: 2 }
  ];
</script>

<section class="panel" aria-label="Disk">
  <header>
    <h3>Disk</h3>
    <span class="readout">{formatPercent(pct, 1)}</span>
  </header>
  {#if diskTotalGb !== undefined}
    <p class="sub">
      <span class="used">{formatTabular(used, { decimals: 1, suffix: 'GB' })}</span>
      <span class="sep"> / </span>
      <span class="total">{formatTabular(diskTotalGb, { decimals: 0, suffix: 'GB' })}</span>
    </p>
  {/if}
  {#if hasChart}
    <TimeSeries {data} {series} {height} yRange={[0, 100]} formatY={(v) => formatPercent(v, 0)} />
  {/if}
</section>

<style>
  .panel {
    background: var(--bg-surface);
    padding: 0.875rem 1rem 1rem;
    color: var(--fg-primary);
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
    font-weight: 500;
    font-size: 0.8125rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0;
    color: var(--fg-primary);
    opacity: 0.8;
  }
  .readout {
    font-weight: 600;
    color: var(--fg-strong);
    font-variant-numeric: tabular-nums;
    font-size: 1.375rem;
    line-height: 1;
  }
  .sub {
    margin: 0;
    color: var(--fg-primary);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .sep {
    opacity: 0.5;
  }
</style>
