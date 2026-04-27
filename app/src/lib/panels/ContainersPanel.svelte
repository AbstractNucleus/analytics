<!-- Per-host container table: one row per container with current CPU, memory,
     and aggregate network rate alongside the human-readable status. -->
<script lang="ts">
  import { formatByteRate, formatPercent, formatTabular } from '$lib/format';
  import type { ContainerRow } from '$lib/beszel';

  type Props = {
    containers: ContainerRow[];
  };

  const { containers }: Props = $props();

  const sorted = $derived([...containers].sort((a, b) => a.name.localeCompare(b.name)));
</script>

<section class="panel" aria-label="Containers">
  <header>
    <h3>Containers</h3>
    <span class="count">{sorted.length}</span>
  </header>
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
          <td class="status">{c.status}</td>
          <td class="num">{formatPercent(c.cpuPct, 1)}</td>
          <td class="num">{formatTabular(c.memMb, { decimals: 1, suffix: 'MB' })}</td>
          <td class="num">{formatByteRate(c.netBps)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
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
  .count {
    font-weight: var(--weight-bold);
    color: var(--text-bold);
    font-variant-numeric: tabular-nums;
    font-size: 1rem;
    line-height: 1;
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
    padding: 0.3rem 0.5rem;
    font-size: 0.875rem;
    border-bottom: 1px solid color-mix(in srgb, var(--text-regular) 12%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  thead th {
    font-weight: var(--weight-medium);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-regular);
    opacity: 0.6;
    border-bottom-color: color-mix(in srgb, var(--text-regular) 24%, transparent);
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  td.name {
    color: var(--text-bold);
    font-weight: var(--weight-medium);
  }
  td.image {
    color: var(--text-regular);
  }
  td.mono {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: 0.8125rem;
  }
  th.num,
  td.num {
    text-align: right;
  }
  th.name,
  td.name {
    width: 22%;
  }
  th.image,
  td.image {
    width: 28%;
  }
  th.status,
  td.status {
    width: 18%;
  }
  th.num,
  td.num {
    width: 10.6%;
  }
  @media (max-width: 720px) {
    th.image,
    td.image {
      display: none;
    }
    th.name,
    td.name {
      width: 28%;
    }
    th.status,
    td.status {
      width: 22%;
    }
  }
</style>
