<!-- Current disk usage % plus a used-of-total GB readout when total is known. -->
<script lang="ts">
  import { formatPercent, formatTabular } from '$lib/format';

  type Props = {
    currentPct?: number;
    diskTotalGb?: number;
  };

  const { currentPct, diskTotalGb }: Props = $props();

  const pct = $derived(currentPct ?? NaN);
  const used = $derived(
    diskTotalGb !== undefined && Number.isFinite(pct) ? (pct / 100) * diskTotalGb : NaN
  );
</script>

<section class="panel" aria-label="Disk">
  <header>
    <h3>Disk</h3>
    <span class="readout">{formatPercent(pct, 1)}</span>
  </header>
  {#if diskTotalGb !== undefined}
    <p class="sub">
      <span class="used">{formatTabular(used, { decimals: 1, suffix: 'GB' })}</span>
      <span class="sep"> / </span>
      <span class="total">{formatTabular(diskTotalGb, { decimals: 0, suffix: 'GB' })}</span>
    </p>
  {/if}
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
    margin-bottom: 0.25rem;
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
  .sub {
    margin: 0;
    color: var(--text-regular);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .sep {
    opacity: 0.6;
  }
</style>
