<!-- Renders any error caught by SvelteKit's error boundary inside the
     layout chrome. Without this, an unreachable Beszel hub bottoms out at
     the framework's default unstyled HTML page. -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<section class="error" aria-labelledby="error-status">
  <div class="card">
    <span id="error-status" class="status">{page.status}</span>
    <p class="message">{page.error?.message ?? 'Something went wrong.'}</p>
    <a class="back" href="/">← Back to fleet</a>
  </div>
</section>

<style>
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 1rem;
  }
  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    padding: 1.75rem 2rem;
    max-width: 32rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    text-align: center;
  }
  .status {
    color: var(--accent);
    font-size: 2.5rem;
    font-weight: 300;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .message {
    margin: 0;
    color: var(--fg-strong);
    font-size: 1rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .back {
    color: var(--accent);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
</style>
