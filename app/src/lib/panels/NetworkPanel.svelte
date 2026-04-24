<!-- Current read/sent byte-rates plus a two-series sparkline. -->
<script lang="ts">
  import { TimeSeries } from '$lib/chart';
  import { formatByteRate } from '$lib/format';
  import type { StatsSample } from '$lib/beszel';

  type Props = {
    samples: StatsSample[];
    currentReadBps?: number;
    currentSentBps?: number;
    height?: number;
  };

  const {
    samples,
    currentReadBps,
    currentSentBps,
    height = 100
  }: Props = $props();

  const read = $derived(
    currentReadBps ?? (samples.length > 0 ? samples[samples.length - 1].netReadBps : NaN)
  );
  const sent = $derived(
    currentSentBps ?? (samples.length > 0 ? samples[samples.length - 1].netSentBps : NaN)
  );

  const data = $derived<[number[], number[], number[]]>([
    samples.map((s) => Math.floor(s.timestamp / 1000)),
    samples.map((s) => s.netReadBps),
    samples.map((s) => s.netSentBps)
  ]);

  const series = [
    {},
    { label: 'Read', stroke: 'var(--accent)' },
    { label: 'Sent', stroke: 'var(--text-medium)' }
  ];
</script>

<section class="panel" aria-label="Network">
  <header>
    <h3>Network</h3>
  </header>
  <dl class="rates">
    <div>
      <dt>Read</dt>
      <dd>{formatByteRate(read)}</dd>
    </div>
    <div>
      <dt>Sent</dt>
      <dd>{formatByteRate(sent)}</dd>
    </div>
  </dl>
  <TimeSeries {data} {series} {height} formatY={(v) => formatByteRate(v)} />
</section>

<style>
  .panel {
    background: var(--sub-alt);
    padding: 0.75rem 1rem;
    color: var(--text-regular);
  }
  header {
    margin-bottom: 0.5rem;
  }
  h3 {
    font-weight: var(--weight-medium);
    font-size: 0.875rem;
    margin: 0;
    color: var(--text-medium);
  }
  .rates {
    display: flex;
    gap: 1.5rem;
    margin: 0 0 0.5rem;
    font-variant-numeric: tabular-nums;
  }
  .rates div {
    display: flex;
    flex-direction: column;
  }
  dt {
    font-size: 0.75rem;
    color: var(--text-regular);
    opacity: 0.7;
  }
  dd {
    margin: 0;
    font-weight: var(--weight-bold);
    color: var(--text-bold);
  }
</style>
