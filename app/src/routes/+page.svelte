<!-- Fleet view: one row per host, linking into the per-host detail page. -->
<script lang="ts">
  import FleetRow from '$lib/panels/FleetRow.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<section class="fleet" aria-label="Fleet">
  {#each data.systems as system (system.id)}
    <a class="fleet-link" href="/hosts/{system.slug}">
      <FleetRow {system} />
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
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
