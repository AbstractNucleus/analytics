<script lang="ts">
  import { onMount } from 'svelte';
  import UPlot from 'uplot';
  import type uPlot from 'uplot';

  type Props = {
    data: uPlot.AlignedData;
    series: uPlot.Series[];
    height: number;
    formatX?: (v: number) => string;
    formatY?: (v: number) => string;
    /** Lock the y scale to a fixed range. Use for percentages so charts
        don't auto-zoom into the noise floor. */
    yRange?: [number, number];
  };

  const { data, series, height, formatX, formatY, yRange }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let chart: uPlot | undefined = $state();

  // uPlot's module body is side-effect free (just a class definition), so the
  // static import above is SSR-safe. The canvas-touching work happens inside
  // the constructor, which we only invoke from onMount — i.e. browser only.
  onMount(() => {
    if (!container) return;

    // Canvas does not resolve CSS custom properties (e.g. `var(--accent)`),
    // so substitute any `var(--name)` strings on series with their computed
    // values from the host element. Without this, lines render invisible.
    const cs = getComputedStyle(container);
    const resolveVar = (v: unknown): unknown => {
      if (typeof v !== 'string') return v;
      return v.replace(/var\((--[^)]+)\)/g, (_m, name) => cs.getPropertyValue(name).trim() || _m);
    };
    const resolvedSeries = series.map((s) => {
      const next: Record<string, unknown> = { ...(s as Record<string, unknown>) };
      if ('stroke' in next) next.stroke = resolveVar(next.stroke);
      if ('fill' in next) next.fill = resolveVar(next.fill);
      return next as uPlot.Series;
    });

    const opts: uPlot.Options = {
      width: container.clientWidth || 600,
      height,
      series: resolvedSeries,
      legend: { show: false },
      scales: yRange ? { y: { range: () => [yRange[0], yRange[1]] } } : undefined,
      axes: [
        formatX ? { values: (_u, vals) => vals.map(formatX) } : {},
        formatY ? { values: (_u, vals) => vals.map(formatY) } : {}
      ]
    };

    chart = new UPlot(opts, data, container);

    // uPlot's constructor captures container width once; keep it in sync with
    // the parent so panels grow/shrink with the page (responsive grid).
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (!chart || !container) return;
        const w = container.clientWidth;
        if (w > 0) chart.setSize({ width: w, height });
      });
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
      chart?.destroy();
      chart = undefined;
    };
  });

  // Push new data into the existing chart rather than recreating it — uPlot is
  // designed for cheap setData() updates on a stable instance. We skip the
  // first run because the constructor already received the initial data.
  let primed = false;
  $effect(() => {
    // touch `data` so the effect re-runs when the prop changes
    const next = data;
    if (!chart) return;
    if (!primed) {
      primed = true;
      return;
    }
    chart.setData(next);
  });
</script>

<div bind:this={container} class="timeseries" style:height="{height}px"></div>

<style>
  .timeseries {
    width: 100%;
  }
</style>
