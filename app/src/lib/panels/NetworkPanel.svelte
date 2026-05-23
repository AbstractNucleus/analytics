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
    height = 160
  }: Props = $props();

  const read = $derived(
    currentReadBps ?? (samples.length > 0 ? samples[samples.length - 1].netRecvBps : NaN)
  );
  const sent = $derived(
    currentSentBps ?? (samples.length > 0 ? samples[samples.length - 1].netSentBps : NaN)
  );

  const data = $derived<[number[], number[], number[]]>([
    samples.map((s) => Math.floor(s.timestamp / 1000)),
    samples.map((s) => s.netRecvBps),
    samples.map((s) => s.netSentBps)
  ]);

  const series = [
    {},
    { label: 'Read', stroke: 'var(--accent)', width: 2 },
    { label: 'Sent', stroke: 'var(--fg-primary)', width: 2 }
  ];
</script>

<section class="panel" aria-label="Network">
  <header>
    <h3>Network</h3>
    <dl class="rates">
      <div class="rate read">
        <dt><span class="swatch" aria-hidden="true"></span>Read</dt>
        <dd>{formatByteRate(read)}</dd>
      </div>
      <div class="rate sent">
        <dt><span class="swatch" aria-hidden="true"></span>Sent</dt>
        <dd>{formatByteRate(sent)}</dd>
      </div>
    </dl>
  </header>
  <TimeSeries {data} {series} {height} formatY={(v) => formatByteRate(v)} />
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
    gap: 1rem;
    flex-wrap: wrap;
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
  .rates {
    display: flex;
    gap: 1.5rem;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .rate {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  dt {
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-primary);
    opacity: 0.7;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .swatch {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    display: inline-block;
  }
  .read .swatch {
    background: var(--accent);
  }
  .sent .swatch {
    background: var(--fg-primary);
    opacity: 0.7;
  }
  dd {
    margin: 0;
    font-weight: 600;
    color: var(--fg-strong);
    font-size: 1rem;
  }
</style>
