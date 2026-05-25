<!-- Per-host disk panel: one row per filesystem with mount, used/total, %, and
     a bar; read/write rate strip in the header; root-mount sparkline beneath.

     Extra filesystems are only reported by Beszel when the agent is started
     with `EXTRA_FILESYSTEMS=/path[,…]`. When only the root mount is reported
     we render a single row plus a quiet hint linking to the env-var docs. -->
<script lang="ts">
  import { TimeSeries } from '$lib/chart';
  import { formatByteRate, formatPercent, formatTabular } from '$lib/format';
  import type { DiskUsage, StatsSample } from '$lib/beszel';

  type Props = {
    /** Most recent sample. Drives the per-disk rows + I/O rates. */
    latest?: StatsSample;
    samples?: StatsSample[];
    height?: number;
  };

  const { latest, samples = [], height = 120 }: Props = $props();

  // Per-disk rows come from latest.disks; fall back to an empty list if no
  // sample yet (rendered as a placeholder so the panel keeps its shape).
  const disks = $derived<DiskUsage[]>(latest?.disks ?? []);

  // Hide the hint once any extra filesystem is reported. Heuristic: if there
  // are 2+ disks we're already getting extras.
  const onlyRoot = $derived(disks.length <= 1);

  const readBps = $derived(latest?.diskReadBps ?? NaN);
  const writeBps = $derived(latest?.diskWriteBps ?? NaN);
  const hasIo = $derived(
    Number.isFinite(readBps) && Number.isFinite(writeBps) &&
      (readBps > 0 || writeBps > 0 || (latest !== undefined && (latest.diskReadBps > 0 || latest.diskWriteBps > 0))),
  );

  // Sparkline: root disk % over time (extras don't have history populated by
  // current Beszel rollups).
  const hasChart = $derived(samples.length > 1);
  const chartData = $derived<[number[], number[]]>([
    samples.map((s) => Math.floor(s.timestamp / 1000)),
    samples.map((s) => s.diskPct),
  ]);
  const chartSeries = [
    {},
    { label: 'Disk', stroke: 'var(--accent)', fill: 'var(--accent-soft)', width: 2 },
  ];

  function heat(v: number): 'cool' | 'warm' | 'hot' {
    if (!Number.isFinite(v)) return 'cool';
    if (v >= 90) return 'hot';
    if (v >= 75) return 'warm';
    return 'cool';
  }

  /** Cap the bar fill at 100% even when Beszel reports >100 (rare overprovisioning). */
  function clampPct(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }
</script>

<section class="panel" aria-label="Disk">
  <header class="panel-header">
    <h3 class="panel-title">Disk</h3>
    {#if hasIo}
      <dl class="rates" aria-label="Disk I/O">
        <div class="rate read">
          <dt><span class="swatch" aria-hidden="true"></span>Read</dt>
          <dd>{formatByteRate(readBps)}</dd>
        </div>
        <div class="rate write">
          <dt><span class="swatch" aria-hidden="true"></span>Write</dt>
          <dd>{formatByteRate(writeBps)}</dd>
        </div>
      </dl>
    {/if}
  </header>

  {#if disks.length === 0}
    <p class="empty">No disk reported.</p>
  {:else}
    <ul class="disks">
      {#each disks as disk (disk.name)}
        <li class="disk" data-heat={heat(disk.pct)}>
          <span class="disk-name mono">{disk.name}</span>
          <span class="disk-pct">{formatPercent(disk.pct, 1)}</span>
          <span class="disk-track" aria-hidden="true">
            <span class="disk-fill" style:width="{clampPct(disk.pct)}%"></span>
          </span>
          <span class="disk-size">
            <span class="disk-used">{formatTabular(disk.usedGb, { decimals: 1 })}</span>
            <span class="disk-sep">/</span>
            <span class="disk-total">{formatTabular(disk.totalGb, { decimals: 0, suffix: 'GB' })}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if hasChart}
    <TimeSeries data={chartData} series={chartSeries} {height} yRange={[0, 100]} formatY={(v) => formatPercent(v, 0)} />
  {/if}

  {#if onlyRoot && disks.length === 1}
    <p class="hint">
      Only the root mount is reported. To track additional filesystems, set
      <code>EXTRA_FILESYSTEMS=/mount/a,/mount/b</code> on the host's
      <code>beszel-agent</code>.
    </p>
  {/if}
</section>

<style>
  /* I/O strip ------------------------------------------------------------- */
  .rates {
    display: flex;
    gap: 1.25rem;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .rate {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  dt {
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-muted);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .swatch {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 1px;
    display: inline-block;
  }
  .read .swatch {
    background: var(--accent);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--accent) 60%, transparent);
  }
  .write .swatch {
    background: var(--fg-primary);
    opacity: 0.65;
  }
  dd {
    margin: 0;
    font-weight: 600;
    color: var(--fg-strong);
    font-size: 0.95rem;
  }

  /* Disk list ------------------------------------------------------------ */
  .disks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .disk {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    column-gap: 0.625rem;
    row-gap: 0.3rem;
    align-items: baseline;
    padding: 0.45rem 0.6rem 0.55rem;
    background: color-mix(in srgb, var(--bg-elevated) 25%, transparent);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-small);
  }
  .disk-name {
    grid-column: 1;
    grid-row: 1;
    color: var(--fg-strong);
    font-size: 0.8125rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.005em;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .disk-pct {
    grid-column: 2;
    grid-row: 1;
    color: var(--fg-strong);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: 0.9375rem;
    text-align: right;
    transition: color var(--motion-fast) var(--ease);
  }
  .disk[data-heat='warm'] .disk-pct { color: var(--accent); }
  .disk[data-heat='hot'] .disk-pct {
    color: var(--status);
    text-shadow: 0 0 8px color-mix(in srgb, var(--status) 40%, transparent);
  }

  .disk-track {
    grid-column: 1 / -1;
    grid-row: 2;
    position: relative;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg-muted) 18%, transparent);
    overflow: hidden;
  }
  .disk-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--fg-primary) 55%, transparent),
      color-mix(in srgb, var(--fg-strong) 70%, transparent)
    );
    transition: width var(--motion-med) cubic-bezier(0.4, 0, 0.2, 1);
  }
  .disk[data-heat='warm'] .disk-fill {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--accent) 55%, transparent),
      var(--accent)
    );
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .disk[data-heat='hot'] .disk-fill {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--accent) 65%, transparent),
      var(--status)
    );
    box-shadow: 0 0 10px 0 color-mix(in srgb, var(--status) 50%, transparent);
  }

  .disk-size {
    grid-column: 1 / -1;
    grid-row: 3;
    color: var(--fg-muted);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.05rem;
  }
  .disk-used { color: var(--fg-primary); }
  .disk-sep { opacity: 0.5; margin: 0 0.2rem; }

  /* Disk grid bumps to 3 rows when size is shown. */
  .disk {
    grid-template-rows: auto auto auto;
  }

  /* Empty + hint ---------------------------------------------------------- */
  .empty {
    margin: 0;
    color: var(--fg-muted);
    font-size: 0.8125rem;
  }
  .hint {
    margin: 0;
    padding-top: 0.25rem;
    color: var(--fg-muted);
    font-size: 0.7rem;
    line-height: 1.5;
  }
  .hint code {
    background: var(--bg-elevated);
    padding: 0.05rem 0.3rem;
    border-radius: var(--radius-small);
    font-size: 0.7rem;
    color: var(--fg-primary);
  }
</style>
