<!-- Uptime readout and kernel string for a single host. -->
<script lang="ts">
  import { formatUptime } from '$lib/format';
  import type { SystemRow } from '$lib/beszel';

  type Props = {
    system: SystemRow;
  };

  const { system }: Props = $props();
</script>

<section class="panel" aria-label="Uptime and kernel">
  <header>
    <h3>Uptime &amp; Kernel</h3>
  </header>
  <dl>
    <div>
      <dt>Uptime</dt>
      <dd>{formatUptime(system.uptimeSeconds)}</dd>
    </div>
    <div>
      <dt>Kernel</dt>
      <dd>{system.kernel}</dd>
    </div>
    <div>
      <dt>OS</dt>
      <dd>{system.os}</dd>
    </div>
  </dl>
</section>

<style>
  .panel {
    background: var(--sub-alt);
    padding: 0.75rem 1rem;
    color: var(--text-regular);
  }
  header {
    margin-bottom: 0.5rem;
  }
  h3 {
    font-weight: var(--weight-medium);
    font-size: 0.875rem;
    margin: 0;
    color: var(--text-medium);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 1rem;
    row-gap: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  dl div {
    display: contents;
  }
  dt {
    font-size: 0.875rem;
    color: var(--text-regular);
    opacity: 0.7;
  }
  dd {
    margin: 0;
    font-weight: var(--weight-medium);
    color: var(--text-bold);
  }
</style>
