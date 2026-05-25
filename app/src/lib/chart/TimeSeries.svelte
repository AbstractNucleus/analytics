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

  // Parse a #rrggbb / #rgb string to an { r, g, b } triple. Returns null for
  // anything else (rgba(), color(), named colors, var() that didn't resolve).
  function hexToRgb(s: string): { r: number; g: number; b: number } | null {
    const m = /^#([0-9a-f]{3,8})$/i.exec(s.trim());
    if (!m) return null;
    const hex = m[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    return null;
  }

  // uPlot's module body is side-effect free (just a class definition), so the
  // static import above is SSR-safe. The canvas-touching work happens inside
  // the constructor, which we only invoke from onMount — i.e. browser only.
  onMount(() => {
    if (!container) return;

    // Canvas does not resolve CSS custom properties (e.g. `var(--accent)`),
    // so substitute any `var(--name)` strings on series with their computed
    // values from the host element. Without this, lines render invisible.
    const cs = getComputedStyle(container);
    const resolveVar = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      return v.replace(/var\((--[^)]+)\)/g, (_m, name) => cs.getPropertyValue(name).trim() || _m);
    };

    // Resolve each series: stroke becomes a literal color string; fill
    // (if set) is upgraded into a vertical gradient from accent-tinted top
    // to fully transparent bottom. uPlot lets `fill` be a function of
    // (u, seriesIdx) so we defer gradient construction to draw-time.
    const resolvedSeries: uPlot.Series[] = series.map((s) => {
      const next: Record<string, unknown> = { ...(s as Record<string, unknown>) };

      const strokeStr = resolveVar(next.stroke);
      if (strokeStr) next.stroke = strokeStr;

      if (next.fill !== undefined) {
        // Use the resolved stroke color as the fill base. If we can parse it
        // to RGB, build a vertical gradient. Otherwise fall through to the
        // original (resolved) fill string so something still paints.
        const fallbackFill = resolveVar(next.fill) ?? next.fill;
        const baseStrokeStr = typeof next.stroke === 'string' ? next.stroke : '';
        const rgb = baseStrokeStr ? hexToRgb(baseStrokeStr) : null;

        if (rgb) {
          next.fill = (u: uPlot) => {
            const ctx = u.ctx;
            const { top, height: h } = u.bbox;
            const grd = ctx.createLinearGradient(0, top, 0, top + h);
            grd.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`);
            grd.addColorStop(0.55, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`);
            grd.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            return grd;
          };
        } else {
          next.fill = fallbackFill;
        }
      }

      return next as uPlot.Series;
    });

    // uPlot's default axis stroke is black — invisible on the dark surface
    // panels live on. Pull theme-aware values from --chart-axis / --chart-grid
    // and fall back to neutrals so axes never silently render in the default.
    const axisStroke = cs.getPropertyValue('--chart-axis').trim() || '#7a7468';
    const gridStroke = cs.getPropertyValue('--chart-grid').trim() || 'rgba(233,227,214,0.06)';
    const axisX: uPlot.Axis = {
      stroke: axisStroke,
      grid: { stroke: gridStroke, width: 1 },
      ticks: { stroke: gridStroke, width: 1, size: 4 },
      font: '11px "Inter Tight", system-ui, sans-serif',
      gap: 4,
    };
    if (formatX) axisX.values = (_u, vals) => vals.map(formatX);
    const axisY: uPlot.Axis = {
      stroke: axisStroke,
      grid: { stroke: gridStroke, width: 1 },
      ticks: { stroke: gridStroke, width: 1, size: 4 },
      font: '11px "Inter Tight", system-ui, sans-serif',
      gap: 6,
    };
    if (formatY) axisY.values = (_u, vals) => vals.map(formatY);

    // After uPlot finishes drawing each series, paint a soft halo + core dot
    // at the last sample so the chart has a clear "now" anchor. Series 0 is
    // the x scale, skip it.
    const nowMarkerPlugin: uPlot.Plugin = {
      hooks: {
        drawSeries: [
          (u, sIdx) => {
            if (sIdx === 0) return;
            const xs = u.data[0];
            const ys = u.data[sIdx];
            if (!xs || !ys || ys.length === 0) return;
            const lastIdx = ys.length - 1;
            const xv = xs[lastIdx];
            const yv = ys[lastIdx];
            if (!Number.isFinite(xv) || !Number.isFinite(yv)) return;
            const scale = u.series[sIdx].scale ?? 'y';
            const x = u.valToPos(xv as number, 'x', true);
            const y = u.valToPos(yv as number, scale, true);
            const stroke = u.series[sIdx].stroke;
            const color = typeof stroke === 'function' ? stroke(u, sIdx) : stroke;
            if (typeof color !== 'string') return;

            const ctx = u.ctx;
            ctx.save();
            // Outer halo
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
            // Core dot
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(x, y, 2.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          },
        ],
      },
    };

    const opts: uPlot.Options = {
      width: container.clientWidth || 600,
      height,
      series: resolvedSeries,
      legend: { show: false },
      cursor: {
        // Soft cursor lines on hover — much easier on the eyes than uPlot's
        // default solid bright lines on a dark canvas.
        x: true,
        y: true,
        points: { size: 6 },
      },
      scales: yRange ? { y: { range: () => [yRange[0], yRange[1]] } } : undefined,
      axes: [axisX, axisY],
      plugins: [nowMarkerPlugin],
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
    position: relative;
  }
  /* Soften the cursor crosshair uPlot draws by default. */
  .timeseries :global(.u-cursor-x),
  .timeseries :global(.u-cursor-y) {
    background: rgba(255, 255, 255, 0.18) !important;
  }
  .timeseries :global(.u-cursor-pt) {
    border-color: var(--accent) !important;
    background: var(--bg-page) !important;
  }
  /* Make uPlot's axes blend with our type stack. */
  .timeseries :global(.u-axis) {
    font-family: var(--font-sans);
  }
</style>
