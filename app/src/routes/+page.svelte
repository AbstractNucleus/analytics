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
  {#each data.systems as system (system.id)}
    <a class="fleet-link" href="/hosts/{system.slug}">
      <FleetRow {system} lastSeenMs={system.lastSeenMs} {nowMs} />
    </a>
  {/each}
</section>

<style>
  .fleet {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fleet-link {
    color: inherit;
    text-decoration: none;
  }
  .fleet-link:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
</style>
