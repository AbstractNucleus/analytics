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
    { label: 'Disk', stroke: 'var(--accent)', fill: 'var(--accent-soft)', width: 2 }
  ];
</script>

<section class="panel" aria-label="Disk">
  <header class="panel-header">
    <h3 class="panel-title">Disk</h3>
    <span class="panel-readout">{formatPercent(pct, 1)}</span>
  </header>
  {#if diskTotalGb !== undefined}
    <p class="sub">
      <span class="used">{formatTabular(used, { decimals: 1 })}</span>
      <span class="sep">/</span>
      <span class="total">{formatTabular(diskTotalGb, { decimals: 0, suffix: 'GB' })}</span>
    </p>
  {/if}
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
