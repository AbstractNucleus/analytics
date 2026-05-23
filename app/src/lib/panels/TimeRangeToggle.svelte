<!-- Four-button toggle for the layout-level TimeRange store. -->
<script lang="ts">
  import { range, setRange, type TimeRange } from './timeRangeStore';

  const OPTIONS: TimeRange[] = ['1h', '24h', '7d', '30d'];
</script>

<div class="toggle" role="group" aria-label="Time range">
  {#each OPTIONS as option (option)}
    <button
      type="button"
      aria-pressed={$range === option}
      class:active={$range === option}
      onclick={() => setRange(option)}
    >
      {option}
    </button>
  {/each}
</div>

<style>
  .toggle {
    display: inline-flex;
    gap: 0;
    background: var(--bg-surface);
  }
  button {
    background: transparent;
    color: var(--fg-primary);
    border: none;
    padding: 0.375rem 0.75rem;
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color var(--motion-fast) var(--ease);
    min-height: 2.75rem;
    min-width: 2.75rem;
  }
  @media (hover: none) and (pointer: coarse) {
    button {
      padding: 0.625rem 1rem;
    }
  }
  button:hover {
    color: var(--fg-strong);
  }
  button:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  button.active {
    color: var(--accent);
    font-weight: 600;
  }
</style>
