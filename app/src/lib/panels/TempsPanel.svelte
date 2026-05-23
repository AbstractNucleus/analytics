<!-- Per-sensor temperature readouts. -->
<script lang="ts">
  import { formatTabular } from '$lib/format';

  type Props = {
    temps: Record<string, number>;
  };

  const { temps }: Props = $props();

  const entries = $derived(Object.entries(temps).sort(([a], [b]) => a.localeCompare(b)));
</script>

<section class="panel" aria-label="Temperatures">
  <header>
    <h3>Temperatures</h3>
  </header>
  {#if entries.length === 0}
    <p class="empty">no sensors reported</p>
  {:else}
    <dl>
      {#each entries as [name, value] (name)}
        <div>
          <dt>{name}</dt>
          <dd>{formatTabular(value, { decimals: 1, suffix: '°C' })}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</section>

<style>
  .panel {
    background: var(--bg-surface);
    padding: 0.75rem 1rem;
    color: var(--fg-primary);
  }
  header {
    margin-bottom: 0.5rem;
  }
  h3 {
    font-weight: 500;
    font-size: 0.875rem;
    margin: 0;
    color: var(--fg-primary);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    row-gap: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  dl div {
    display: contents;
  }
  dt {
    font-size: 0.875rem;
    color: var(--fg-primary);
  }
  dd {
    margin: 0;
    font-weight: 500;
    color: var(--fg-strong);
    text-align: right;
  }
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--fg-primary);
    opacity: 0.6;
  }
</style>
