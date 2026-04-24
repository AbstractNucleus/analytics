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
  };

  const { data, series, height, formatX, formatY }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let chart: uPlot | undefined = $state();

  // uPlot's module body is side-effect free (just a class definition), so the
  // static import above is SSR-safe. The canvas-touching work happens inside
  // the constructor, which we only invoke from onMount — i.e. browser only.
  onMount(() => {
    if (!container) return;

    const opts: uPlot.Options = {
      width: container.clientWidth || 600,
      height,
      series,
      axes: [
        formatX ? { values: (_u, vals) => vals.map(formatX) } : {},
        formatY ? { values: (_u, vals) => vals.map(formatY) } : {}
      ]
    };

    chart = new UPlot(opts, data, container);

    return () => {
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
