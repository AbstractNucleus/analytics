<!-- Four-button segmented toggle for the layout-level TimeRange store. The
     active option is highlighted with a sliding pill background that animates
     between positions. -->
<script lang="ts">
  import { range, setRange, type TimeRange } from './timeRangeStore';

  const OPTIONS: TimeRange[] = ['1h', '24h', '7d', '30d'];

  const activeIndex = $derived(OPTIONS.indexOf($range));
</script>

<div class="toggle" role="group" aria-label="Time range">
  <span
    class="indicator"
    aria-hidden="true"
    style:--idx={activeIndex}
    style:--count={OPTIONS.length}
  ></span>
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
    position: relative;
    display: inline-flex;
    isolation: isolate;
    padding: 3px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-soft);
    background: color-mix(in srgb, var(--bg-elevated) 60%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .indicator {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px) / var(--count));
    transform: translateX(calc(var(--idx) * 100%));
    transition: transform var(--motion-med) cubic-bezier(0.4, 0, 0.2, 1);
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.02)
    );
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 1px 2px rgba(0, 0, 0, 0.4);
    z-index: 0;
  }

  button {
    position: relative;
    z-index: 1;
    background: transparent;
    color: var(--fg-muted);
    border: none;
    padding: 0.375rem 0.85rem;
    font: inherit;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color var(--motion-fast) var(--ease);
    border-radius: var(--radius-pill);
    min-height: 1.75rem;
    flex: 1;
    text-align: center;
  }

  @media (hover: none) and (pointer: coarse) {
    button {
      padding: 0.5rem 1rem;
      min-height: 2.5rem;
    }
  }

  button:hover {
    color: var(--fg-primary);
  }

  button:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  button.active {
    color: var(--fg-strong);
    font-weight: 500;
  }

  @media (prefers-reduced-motion: reduce) {
    .indicator {
      transition: none;
    }
  }
</style>
