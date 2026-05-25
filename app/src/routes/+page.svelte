<!-- Fleet view: one row per host, linking into the per-host detail page. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import FleetRow from '$lib/panels/FleetRow.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Tick at 1s so "30s ago" stays current. A second-resolution clock is fine
  // for relative timestamps; sub-second updates would over-render.
  let nowMs = $state(Date.now());
  onMount(() => {
    const tick = setInterval(() => { nowMs = Date.now(); }, 1000);
    return () => clearInterval(tick);
  });
</script>

<section class="fleet" aria-label="Fleet">
  {#each data.systems as system, i (system.id)}
    <div class="row-frame" style:--row-index={i}>
      <FleetRow
        {system}
        lastSeenMs={system.lastSeenMs}
        {nowMs}
        href="/hosts/{system.slug}"
      />
    </div>
  {/each}
</section>

<style>
  .fleet {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border-soft);
    background: var(--bg-surface);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.02) inset,
      0 12px 32px -16px rgba(0, 0, 0, 0.6);
  }

  /* Staggered entrance: rows fade-up with a 30ms delay between each. */
  .row-frame {
    animation: row-enter 320ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
    animation-delay: calc(var(--row-index, 0) * 30ms);
  }

  @keyframes row-enter {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .row-frame {
      animation: none;
    }
  }
</style>
