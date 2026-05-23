<!-- Root layout: pulls in design tokens and hoists the TimeRangeToggle into a
     shared header so every route inherits the same visual chrome. -->
<script lang="ts">
  import '$lib/design';
  import { TimeRangeToggle } from '$lib/panels';

  let { children } = $props();
</script>

<div class="shell">
  <header class="top">
    <a class="brand" href="/">analytics</a>
    <TimeRangeToggle />
  </header>
  <main>
    {@render children?.()}
  </main>
</div>

<style>
  :global(a) {
    color: var(--accent);
    text-decoration: none;
  }
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-soft);
  }
  .brand {
    font-weight: 600;
    color: var(--fg-strong);
    letter-spacing: 0.04em;
  }
  main {
    flex: 1;
    padding: 1rem 1.25rem;
  }
  @media (max-width: 600px) {
    .top {
      padding: 0.625rem 0.875rem;
    }
    main {
      padding: 0.75rem 0.875rem;
    }
  }
</style>
