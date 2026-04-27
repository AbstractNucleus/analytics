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
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text-regular);
    font-family: 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-weight: var(--weight-regular);
  }
  :global(a) {
    color: var(--accent);
    text-decoration: none;
  }
  :global(a:focus-visible) {
    outline: none;
    box-shadow: var(--focus-ring);
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
    background: var(--sub-alt);
    border-bottom: 1px solid var(--bg);
  }
  .brand {
    font-weight: var(--weight-bold);
    color: var(--text-bold);
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
