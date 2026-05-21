<script lang="ts">
  import { onMount } from 'svelte';
  import UPlot from 'uplot';
  import type uPlot from 'uplot';
  // uPlot ships CSS that absolutely-positions its axes/overlay layers inside
  // the chart wrapper. Without it the axis labels flow as block elements,
  // stacking below the canvas and overflowing the panel — visible on Safari
  // but not Chrome (browser-default position/overflow handling differs).
  import 'uplot/dist/uPlot.min.css';

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

    // uPlot's default axis stroke is black — invisible on the dark surface
    // panels live on. Pull theme-aware values from --chart-axis / --chart-grid
    // and fall back to neutrals so axes never silently render in the default.
    const axisStroke = cs.getPropertyValue('--chart-axis').trim() || '#7a7468';
    const gridStroke = cs.getPropertyValue('--chart-grid').trim() || 'rgba(233,227,214,0.08)';
    const axisX: uPlot.Axis = {
      stroke: axisStroke,
      grid: { stroke: gridStroke },
      ticks: { stroke: axisStroke }
    };
    if (formatX) axisX.values = (_u, vals) => vals.map(formatX);
    const axisY: uPlot.Axis = {
      stroke: axisStroke,
      grid: { stroke: gridStroke },
      ticks: { stroke: axisStroke }
    };
    if (formatY) axisY.values = (_u, vals) => vals.map(formatY);

    const opts: uPlot.Options = {
      width: container.clientWidth || 600,
      height,
      series: resolvedSeries,
      legend: { show: false },
      scales: yRange ? { y: { range: () => [yRange[0], yRange[1]] } } : undefined,
      axes: [axisX, axisY]
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
