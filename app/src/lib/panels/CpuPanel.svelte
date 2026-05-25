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
    { label: 'CPU', stroke: 'var(--accent)', fill: 'var(--accent-soft)', width: 2 }
  ];

  const fmtLoad = (v: number) => formatTabular(v, { decimals: 2 });
</script>

<section class="panel" aria-label="CPU">
  <header class="panel-header">
    <h3 class="panel-title">CPU</h3>
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
      <span class="panel-readout">{formatPercent(current, 1)}</span>
    </div>
  </header>
  <TimeSeries {data} {series} {height} yRange={[0, 100]} formatY={(v) => formatPercent(v, 0)} />
</section>

<style>
  .meters {
    display: flex;
    align-items: baseline;
    gap: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .loadavg {
    color: var(--fg-primary);
    font-size: 0.8125rem;
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .loadavg .k {
    color: var(--fg-muted);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .loadavg .v {
    color: var(--fg-primary);
  }
  .loadavg .sep {
    color: var(--fg-muted);
    opacity: 0.5;
  }
</style>
