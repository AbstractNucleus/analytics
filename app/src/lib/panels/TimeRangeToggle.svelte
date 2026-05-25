<!-- Four-button segmented toggle bound to the `?range=` URL search param. The
     URL is the source of truth so per-host SSR loads can read it and refetch
     with the matching window. Clicking updates the URL via goto() with
     replaceState so toggle history doesn't pollute the back stack. -->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  type TimeRange = '1h' | '24h' | '7d' | '30d';

  const OPTIONS: TimeRange[] = ['1h', '24h', '7d', '30d'];
  const DEFAULT: TimeRange = '24h';

  // Active range derives from the URL, with a safe default. `page.url` is a
  // reactive proxy in Svelte 5 so this re-runs on every navigation.
  const activeRange = $derived.by<TimeRange>(() => {
    const raw = page.url?.searchParams.get('range');
    return raw && (OPTIONS as string[]).includes(raw) ? (raw as TimeRange) : DEFAULT;
  });
  const activeIndex = $derived(OPTIONS.indexOf(activeRange));

  async function pick(option: TimeRange) {
    if (option === activeRange) return;
    const target = new URL(page.url);
    if (option === DEFAULT) {
      target.searchParams.delete('range');
    } else {
      target.searchParams.set('range', option);
    }
    await goto(target.pathname + target.search, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }
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
      aria-pressed={activeRange === option}
      class:active={activeRange === option}
      onclick={() => pick(option)}
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
