<!-- Renders any error caught by SvelteKit's error boundary inside the
     layout chrome. Without this, an unreachable Beszel hub bottoms out at
     the framework's default unstyled HTML page. -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<section class="error" aria-labelledby="error-status">
  <div class="card">
    <span class="halo" aria-hidden="true"></span>
    <span id="error-status" class="status">{page.status}</span>
    <p class="message">{page.error?.message ?? 'Something went wrong.'}</p>
    <a class="back" href="/">
      <span aria-hidden="true">←</span>
      <span>Back to fleet</span>
    </a>
  </div>
</section>

<style>
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 70vh;
    padding: 2rem 1rem;
  }
  .card {
    position: relative;
    background: var(--bg-surface);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    padding: 2.5rem 2.25rem 2rem;
    max-width: 30rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    overflow: hidden;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.03) inset,
      0 24px 60px -30px rgba(0, 0, 0, 0.8);
  }
  .halo {
    position: absolute;
    top: -40%;
    left: -10%;
    width: 70%;
    height: 90%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent) 25%, transparent),
      transparent 65%
    );
    pointer-events: none;
    filter: blur(10px);
  }
  .status {
    position: relative;
    color: var(--accent);
    font-size: clamp(3rem, 7vw, 4rem);
    font-weight: 300;
    line-height: 1;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 24px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .message {
    position: relative;
    margin: 0;
    color: var(--fg-strong);
    font-size: 1rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
    letter-spacing: -0.005em;
  }
  .back {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--accent);
    font-size: 0.875rem;
    padding: 0.4rem 0.75rem;
    margin-top: 0.25rem;
    border-radius: var(--radius-small);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    transition:
      background var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }
  .back:hover {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  }
</style>
