<!-- Per-host hero: big hostname headline, status pip with a live pulse, a
     four-up metric ribbon (CPU / MEM / DISK / NET) anchoring the top of the
     page, and a quiet property grid (OS / kernel / CPU / memory / uptime /
     containers / agent) below it.

     Memory total / kernel / OS / CPU descriptor come from SystemDetails;
     disk total + current rates come from the latest StatsSample passed in. -->
<script lang="ts">
  import {
    formatByteRate,
    formatPercent,
    formatRelativeTime,
    formatTabular,
    formatUptime,
  } from '$lib/format';
  import type { StatsSample, SystemRow, SystemDetails } from '$lib/beszel';

  type Props = {
    system: SystemRow;
    details: SystemDetails;
    /** Most recent stats sample. Drives the metric ribbon. */
    latest?: StatsSample;
    lastSeenMs?: number;
    /** nowMs is only for deterministic testing; app callers leave it undefined. */
    nowMs?: number;
  };

  const { system, details, latest, lastSeenMs, nowMs }: Props = $props();

  const BYTES_PER_GB = 1024 * 1024 * 1024;

  const memoryGb = $derived(details.memoryBytes / BYTES_PER_GB);
  const osArch = $derived(
    [details.osName, details.arch].filter((s) => s && s.length > 0).join(' · '),
  );
  const cpuLine = $derived(
    details.cpu
      ? `${details.cpu}${details.cores ? ` · ${details.cores}c/${details.threads}t` : ''}`
      : '',
  );

  // Metric ribbon ------------------------------------------------------------
  // Each metric has a current value (or NaN), an optional secondary label, and
  // a heat band. We don't have prior-tick deltas at this layer so trend cues
  // are left to the panel sparklines below.
  const cpuPct = $derived(latest?.cpuPct ?? NaN);
  const memPct = $derived(latest?.memPct ?? NaN);
  const diskPct = $derived(latest?.diskPct ?? NaN);
  const memUsed = $derived(
    Number.isFinite(memPct) ? (memPct / 100) * memoryGb : NaN,
  );

  function heat(v: number): 'cool' | 'warm' | 'hot' {
    if (!Number.isFinite(v)) return 'cool';
    if (v >= 85) return 'hot';
    if (v >= 60) return 'warm';
    return 'cool';
  }

  const netInBps = $derived(latest?.netRecvBps ?? NaN);
  const netOutBps = $derived(latest?.netSentBps ?? NaN);
</script>

<section class="meta" aria-label="Host details">
  <div class="hero">
    <div class="title">
      <span class="status-dot" data-status={system.status} aria-label={system.status}></span>
      <h1>{system.name}</h1>
      <span class="state-chip" data-status={system.status}>{system.status}</span>
    </div>
    {#if lastSeenMs !== undefined}
      <div class="last-seen">
        <span class="tick" aria-hidden="true"></span>
        <span>{formatRelativeTime(lastSeenMs, nowMs)}</span>
      </div>
    {/if}
  </div>

  {#if latest}
    <div class="ribbon" aria-label="Current metrics">
      <div class="metric" data-heat={heat(cpuPct)}>
        <span class="metric-label">CPU</span>
        <span class="metric-value">{formatPercent(cpuPct, 1)}</span>
      </div>
      <div class="metric" data-heat={heat(memPct)}>
        <span class="metric-label">Memory</span>
        <span class="metric-value">{formatPercent(memPct, 1)}</span>
        {#if Number.isFinite(memUsed) && memoryGb > 0}
          <span class="metric-sub">
            {formatTabular(memUsed, { decimals: 1 })}
            <span class="metric-sub-sep">/</span>
            {formatTabular(memoryGb, { decimals: 0, suffix: 'GB' })}
          </span>
        {/if}
      </div>
      <div class="metric" data-heat={heat(diskPct)}>
        <span class="metric-label">Disk</span>
        <span class="metric-value">{formatPercent(diskPct, 1)}</span>
        {#if latest.diskTotalGb > 0 && Number.isFinite(diskPct)}
          <span class="metric-sub">
            {formatTabular((diskPct / 100) * latest.diskTotalGb, { decimals: 0 })}
            <span class="metric-sub-sep">/</span>
            {formatTabular(latest.diskTotalGb, { decimals: 0, suffix: 'GB' })}
          </span>
        {/if}
      </div>
      <div class="metric">
        <span class="metric-label">Network</span>
        <div class="metric-net">
          <span class="net-row">
            <span class="net-arrow down" aria-hidden="true">↓</span>
            <span class="net-val">{formatByteRate(netInBps)}</span>
          </span>
          <span class="net-row">
            <span class="net-arrow up" aria-hidden="true">↑</span>
            <span class="net-val">{formatByteRate(netOutBps)}</span>
          </span>
        </div>
      </div>
    </div>
  {/if}

  <dl class="props">
    {#if osArch}
      <div>
        <dt>OS</dt>
        <dd>{osArch}</dd>
      </div>
    {/if}
    {#if details.kernel}
      <div>
        <dt>Kernel</dt>
        <dd class="mono">{details.kernel}</dd>
      </div>
    {/if}
    {#if cpuLine}
      <div class="span2">
        <dt>CPU</dt>
        <dd>{cpuLine}</dd>
      </div>
    {/if}
    {#if details.memoryBytes > 0}
      <div>
        <dt>Memory</dt>
        <dd>{formatTabular(memoryGb, { decimals: 0, suffix: 'GB' })}</dd>
      </div>
    {/if}
    <div>
      <dt>Uptime</dt>
      <dd>{formatUptime(system.uptimeSeconds)}</dd>
    </div>
    {#if system.containerCount > 0}
      <div>
        <dt>Containers</dt>
        <dd>{system.containerCount}</dd>
      </div>
    {/if}
    {#if system.agentVersion}
      <div>
        <dt>Agent</dt>
        <dd class="mono">{system.agentVersion}</dd>
      </div>
    {/if}
  </dl>
</section>

<style>
  .meta {
    position: relative;
    background:
      radial-gradient(
        120% 80% at 0% 0%,
        color-mix(in srgb, var(--accent) 8%, transparent),
        transparent 55%
      ),
      var(--bg-surface);
    padding: 1.5rem 1.5rem 1.25rem;
    color: var(--fg-primary);
    display: flex;
    flex-direction: column;
    gap: 1.375rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.025) inset,
      0 12px 32px -16px rgba(0, 0, 0, 0.6);
  }

  /* Top: hostname + last-seen */
  .hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    flex: 1;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.75rem, 3vw, 2.375rem);
    font-weight: 600;
    color: var(--fg-strong);
    letter-spacing: -0.02em;
    line-height: 1.05;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .status-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: var(--fg-primary);
    flex-shrink: 0;
  }
  .status-dot[data-status='up'] {
    background: var(--success);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 50%, transparent);
    animation: pip-pulse 3s ease-in-out infinite;
  }
  .status-dot[data-status='down'] {
    background: var(--error);
    box-shadow: 0 0 10px 0 color-mix(in srgb, var(--error) 55%, transparent);
  }
  .status-dot[data-status='paused'],
  .status-dot[data-status='pending'] {
    background: var(--fg-muted);
    opacity: 0.6;
  }

  .state-chip {
    padding: 0.15rem 0.55rem;
    border-radius: var(--radius-pill);
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--fg-muted);
    background: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
    border: 1px solid var(--border-soft);
    flex-shrink: 0;
  }
  .state-chip[data-status='up'] {
    color: var(--success);
    border-color: color-mix(in srgb, var(--success) 30%, transparent);
    background: color-mix(in srgb, var(--success) 8%, var(--bg-elevated));
  }
  .state-chip[data-status='down'] {
    color: var(--error);
    border-color: color-mix(in srgb, var(--error) 35%, transparent);
    background: color-mix(in srgb, var(--error) 10%, var(--bg-elevated));
  }

  .last-seen {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    padding: 0.3rem 0.65rem;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--bg-elevated) 60%, transparent);
    border: 1px solid var(--border-soft);
  }
  .tick {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--status);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--status) 60%, transparent);
    animation: live-blink 2s ease-in-out infinite;
  }

  /* Metric ribbon ----------------------------------------------------------- */
  .ribbon {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--border-soft);
    border-radius: var(--radius-small);
    overflow: hidden;
    border: 1px solid var(--border-soft);
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.875rem 1rem;
    background: color-mix(in srgb, var(--bg-elevated) 35%, var(--bg-surface));
    min-width: 0;
  }
  .metric-label {
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fg-muted);
    font-weight: 500;
  }
  .metric-value {
    font-size: clamp(1.5rem, 2.4vw, 1.875rem);
    font-weight: 600;
    color: var(--fg-strong);
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    transition: color var(--motion-fast) var(--ease);
  }
  .metric[data-heat='warm'] .metric-value { color: var(--accent); }
  .metric[data-heat='hot'] .metric-value {
    color: var(--status);
    text-shadow: 0 0 12px color-mix(in srgb, var(--status) 30%, transparent);
  }

  .metric-sub {
    font-size: 0.75rem;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .metric-sub-sep {
    opacity: 0.5;
    margin: 0 0.15rem;
  }

  .metric-net {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-top: 0.1rem;
  }
  .net-row {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    font-variant-numeric: tabular-nums;
  }
  .net-arrow {
    font-size: 0.75rem;
    font-weight: 500;
    width: 0.7rem;
    display: inline-block;
  }
  .net-arrow.down { color: var(--accent); }
  .net-arrow.up { color: var(--fg-muted); }
  .net-val {
    color: var(--fg-strong);
    font-size: 1rem;
    font-weight: 500;
  }

  /* Property grid ----------------------------------------------------------- */
  .props {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.625rem 1.5rem;
    font-variant-numeric: tabular-nums;
    padding-top: 0.25rem;
    border-top: 1px solid var(--border-soft);
    margin-top: 0.25rem;
  }
  .props > div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .props > div.span2 {
    grid-column: span 2;
  }

  dt {
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-muted);
    font-weight: 500;
  }
  dd {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--fg-strong);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  dd.mono {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    letter-spacing: -0.01em;
  }

  /* Motion ----------------------------------------------------------------- */
  @keyframes pip-pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 50%, transparent); }
    70% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--success) 0%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 0%, transparent); }
  }
  @keyframes live-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-dot,
    .tick {
      animation: none;
    }
  }

  /* Responsive ----------------------------------------------------------- */
  @media (max-width: 900px) {
    .meta {
      padding: 1.125rem 1.125rem 1rem;
      gap: 1.125rem;
    }
    .ribbon {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 600px) {
    h1 {
      font-size: 1.5rem;
    }
    .props {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem 1rem;
    }
    .last-seen {
      padding: 0.2rem 0.5rem;
    }
  }
  @media (max-width: 380px) {
    .ribbon {
      grid-template-columns: 1fr;
    }
    .props {
      grid-template-columns: 1fr;
    }
    .props > div.span2 {
      grid-column: auto;
    }
  }
</style>
