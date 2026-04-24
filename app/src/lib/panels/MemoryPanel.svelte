<!-- Current memory % plus a used-of-total GB readout. -->
<script lang="ts">
  import { formatPercent, formatTabular } from '$lib/format';

  type Props = {
    currentPct?: number;
    /** Total memory in bytes (as reported by system_details.memory). */
    memoryBytes: number;
  };

  const { currentPct, memoryBytes }: Props = $props();

  const BYTES_PER_GB = 1024 * 1024 * 1024;

  const pct = $derived(currentPct ?? NaN);
  const totalGb = $derived(memoryBytes / BYTES_PER_GB);
  const used = $derived(Number.isFinite(pct) ? (pct / 100) * totalGb : NaN);
</script>

<section class="panel" aria-label="Memory">
  <header>
    <h3>Memory</h3>
    <span class="readout">{formatPercent(pct, 1)}</span>
  </header>
  <p class="sub">
    <span class="used">{formatTabular(used, { decimals: 1, suffix: 'GB' })}</span>
    <span class="sep"> / </span>
    <span class="total">{formatTabular(totalGb, { decimals: 0, suffix: 'GB' })}</span>
  </p>
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
    color: var(--text-regular);
    opacity: 0.6;
  }
</style>
