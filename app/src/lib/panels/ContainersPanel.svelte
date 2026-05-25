<!-- Per-host container table: one row per container with current CPU, memory,
     and aggregate network rate alongside the human-readable status. Status
     becomes a quiet pill that picks up an accent when the container is in a
     non-running state. -->
<script lang="ts">
  import { formatByteRate, formatPercent, formatTabular } from '$lib/format';
  import type { ContainerRow } from '$lib/beszel';

  type Props = {
    containers: ContainerRow[];
  };

  const { containers }: Props = $props();

  const sorted = $derived([...containers].sort((a, b) => a.name.localeCompare(b.name)));

  // Map Docker's prose status to a tone we can color the pill with. The Docker
  // string is the source of truth — these are display-only buckets.
  function statusTone(raw: string): 'up' | 'restart' | 'exit' | 'paused' | 'created' | 'unknown' {
    const s = raw.toLowerCase();
    if (s.startsWith('up')) return 'up';
    if (s.includes('restart')) return 'restart';
    if (s.startsWith('exited') || s.startsWith('dead')) return 'exit';
    if (s.startsWith('paused')) return 'paused';
    if (s.startsWith('created')) return 'created';
    return 'unknown';
  }
</script>

<section class="panel" aria-label="Containers">
  <header class="panel-header">
    <h3 class="panel-title">Containers</h3>
    <span class="count" title="Total containers reporting">
      <span class="count-num">{sorted.length}</span>
      <span class="count-lbl">running</span>
    </span>
  </header>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th class="name">Name</th>
          <th class="image">Image</th>
          <th class="status">Status</th>
          <th class="num">CPU</th>
          <th class="num">Memory</th>
          <th class="num">Network</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as c (c.id)}
          <tr>
            <td class="name mono">{c.name}</td>
            <td class="image mono" title={c.image}>{c.image}</td>
            <td class="status">
              <span class="status-pill" data-tone={statusTone(c.status)}>
                <span class="status-glyph" aria-hidden="true"></span>
                {c.status}
              </span>
            </td>
            <td class="num">{formatPercent(c.cpuPct, 1)}</td>
            <td class="num">{formatTabular(c.memMb, { decimals: 1, suffix: 'MB' })}</td>
            <td class="num">{formatByteRate(c.netBps)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .count {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    font-variant-numeric: tabular-nums;
  }
  .count-num {
    font-weight: 600;
    color: var(--fg-strong);
    font-size: 1.0625rem;
    line-height: 1;
    letter-spacing: -0.01em;
  }
  .count-lbl {
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  .scroll {
    margin: 0 -1.125rem -1.125rem;
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
    table-layout: fixed;
  }
  th,
  td {
    text-align: left;
    padding: 0.45rem 0.6rem;
    font-size: 0.875rem;
    border-bottom: 1px solid var(--border-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  thead th {
    font-weight: 500;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-muted);
    background: color-mix(in srgb, var(--bg-elevated) 30%, var(--bg-surface));
    border-bottom-color: var(--border-strong);
    position: sticky;
    top: 0;
  }
  tbody tr {
    transition: background var(--motion-fast) var(--ease);
  }
  tbody tr:hover {
    background: color-mix(in srgb, var(--bg-elevated) 50%, transparent);
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  td.name {
    color: var(--fg-strong);
    font-weight: 500;
  }
  td.image {
    color: var(--fg-muted);
  }
  td.mono {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    letter-spacing: -0.01em;
  }
  th.num,
  td.num {
    text-align: right;
    color: var(--fg-primary);
  }
  th.name,
  td.name {
    width: 22%;
    padding-left: 1.125rem;
  }
  th.image,
  td.image {
    width: 26%;
  }
  th.status,
  td.status {
    width: 22%;
  }
  th.num,
  td.num {
    width: 10%;
  }
  th.num:last-child,
  td.num:last-child {
    padding-right: 1.125rem;
  }

  /* Status pill ------------------------------------------------------------ */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.55rem;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
    border: 1px solid var(--border-soft);
    color: var(--fg-muted);
    font-size: 0.75rem;
    font-weight: 500;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-glyph {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--fg-muted);
    flex-shrink: 0;
  }
  .status-pill[data-tone='up'] {
    color: var(--success);
    border-color: color-mix(in srgb, var(--success) 30%, transparent);
    background: color-mix(in srgb, var(--success) 8%, var(--bg-elevated));
  }
  .status-pill[data-tone='up'] .status-glyph {
    background: var(--success);
    box-shadow: 0 0 4px 0 color-mix(in srgb, var(--success) 60%, transparent);
  }
  .status-pill[data-tone='exit'],
  .status-pill[data-tone='restart'] {
    color: var(--error);
    border-color: color-mix(in srgb, var(--error) 35%, transparent);
    background: color-mix(in srgb, var(--error) 10%, var(--bg-elevated));
  }
  .status-pill[data-tone='exit'] .status-glyph,
  .status-pill[data-tone='restart'] .status-glyph {
    background: var(--error);
  }
  .status-pill[data-tone='paused'] .status-glyph,
  .status-pill[data-tone='created'] .status-glyph {
    background: var(--status);
  }
  .status-pill[data-tone='paused'],
  .status-pill[data-tone='created'] {
    color: var(--status-soft);
    border-color: color-mix(in srgb, var(--status) 25%, transparent);
  }

  @media (max-width: 720px) {
    th.image,
    td.image {
      display: none;
    }
    th.name,
    td.name {
      width: 30%;
    }
    th.status,
    td.status {
      width: 26%;
    }
  }
</style>
