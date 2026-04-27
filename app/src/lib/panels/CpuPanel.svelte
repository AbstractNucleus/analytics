<!-- Current CPU % readout, optional load-average triple, and a sparkline. -->
<script lang="ts">
  import { TimeSeries } from '$lib/chart';
  import { formatPercent, formatTabular } from '$lib/format';
  import type { StatsSample } from '$lib/beszel';

  type Props = {
    samples: StatsSample[];
    currentPct?: number;
    /** Load average 1m / 5m / 15m. Rendered next to the % when provided. */
    loadAvg?: [number, number, number];
    height?: number;
  };

  const { samples, currentPct, loadAvg, height = 160 }: Props = $props();

  const current = $derived(
    currentPct ?? (samples.length > 0 ? samples[samples.length - 1].cpuPct : NaN)
  );

  const data = $derived<[number[], number[]]>([
    samples.map((s) => Math.floor(s.timestamp / 1000)),
    samples.map((s) => s.cpuPct)
  ]);

  const series = [
    {},
    { label: 'CPU', stroke: 'var(--accent)', fill: 'rgba(194, 65, 12, 0.14)', width: 2 }
  ];

  const fmtLoad = (v: number) => formatTabular(v, { decimals: 2 });
</script>

<section class="panel" aria-label="CPU">
  <header>
    <h3>CPU</h3>
    <div class="meters">
      {#if loadAvg}
        <span class="loadavg" title="Load average 1m / 5m / 15m">
          <span class="k">load</span>
          <span class="v">{fmtLoad(loadAvg[0])}</span>
          <span class="sep">·</span>
          <span class="v">{fmtLoad(loadAvg[1])}</span>
          <span class="sep">·</span>
          <span class="v">{fmtLoad(loadAvg[2])}</span>
        </span>
      {/if}
      <span class="readout">{formatPercent(current, 1)}</span>
    </div>
  </header>
  <TimeSeries {data} {series} {height} formatY={(v) => formatPercent(v, 0)} />
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
    gap: 1rem;
    flex-wrap: wrap;
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
  .meters {
    display: flex;
    align-items: baseline;
    gap: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .loadavg {
    color: var(--text-regular);
    font-size: 0.8125rem;
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .loadavg .k {
    color: var(--text-regular);
    opacity: 0.6;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .loadavg .v {
    color: var(--text-medium);
  }
  .loadavg .sep {
    color: var(--text-regular);
    opacity: 0.4;
  }
  .readout {
    font-weight: var(--weight-bold);
    color: var(--text-bold);
    font-variant-numeric: tabular-nums;
    font-size: 1.5rem;
    line-height: 1;
  }
</style>
