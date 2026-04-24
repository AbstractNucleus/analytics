<!-- Current CPU % readout plus a sparkline of recent samples. -->
<script lang="ts">
  import { TimeSeries } from '$lib/chart';
  import { formatPercent } from '$lib/format';
  import type { StatsSample } from '$lib/beszel';

  type Props = {
    samples: StatsSample[];
    currentPct?: number;
    height?: number;
  };

  const { samples, currentPct, height = 72 }: Props = $props();

  const current = $derived(
    currentPct ?? (samples.length > 0 ? samples[samples.length - 1].cpuPct : NaN)
  );

  // uPlot wants its AlignedData as [xs, ys]. We feed timestamps in seconds to
  // stay in uPlot's default "time" scale, and cpu % as the single series.
  const data = $derived<[number[], number[]]>([
    samples.map((s) => Math.floor(s.timestamp / 1000)),
    samples.map((s) => s.cpuPct)
  ]);

  const series = [
    {},
    { label: 'CPU', stroke: 'var(--accent)' }
  ];
</script>

<section class="panel" aria-label="CPU">
  <header>
    <h3>CPU</h3>
    <span class="readout">{formatPercent(current, 1)}</span>
  </header>
  <TimeSeries {data} {series} {height} formatY={(v) => formatPercent(v, 0)} />
</section>

<style>
  .panel {
    background: var(--sub-alt);
    padding: 0.75rem 1rem;
    color: var(--text-regular);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }
  h3 {
    font-weight: var(--weight-medium);
    font-size: 0.875rem;
    margin: 0;
    color: var(--text-medium);
  }
  .readout {
    font-weight: var(--weight-bold);
    color: var(--text-bold);
    font-variant-numeric: tabular-nums;
  }
</style>
