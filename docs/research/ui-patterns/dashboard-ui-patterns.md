# Dashboard UI/UX Patterns for Server Analytics & Observability

Reference document for designing a self-hosted, multi-machine analytics site. Covers widget vocabulary, layout patterns, interaction design, real-time behaviour, visual language, anti-patterns, component-library choices, and three concrete style directions that avoid the generic "Bootstrap admin template" look.

---

## 1. Widget / Panel Types

The vocabulary of an observability dashboard. Each panel trades signal-density, glanceability, and interpretation cost differently.

| Panel | When to use | When NOT to use | Gotchas |
|---|---|---|---|
| **Line / area chart (time series)** | The universal default for any metric evolving over time (CPU, RAM, RPS, latency). | One-off discrete values (use a stat card). Cardinality > ~10 series on one axis. | "Rainbow chart syndrome"; untruncated y-axis starts; mismatched time ranges across panels. |
| **Sparkline** | Embed a trend next to a big number so the value has context (Tufte: "compared to what?"). | When the user needs to hover/inspect values — sparklines are glanceable, not interactive. | No axes, so the magnitude of change is ambiguous unless paired with min/max labels. |
| **Gauge / radial / semicircle** | A single bounded metric with a meaningful maximum (disk %, memory %, SLA %). | Unbounded metrics (RPS, bytes/sec). Multiple gauges side-by-side — they waste space vs. a bar chart. | Overuse screams "template dashboard"; hard to compare across multiple gauges. |
| **Big-number stat card (with delta)** | Headline KPIs: current value, delta vs previous period, sparkline. | Metrics where absolute value without context is meaningless. | Delta direction (up=good vs up=bad) is metric-dependent — colour it semantically. |
| **Heatmap** | Distributions over time: CPU per core × time, latency buckets × time, cron duration by hour of day. | Low-cardinality data; only 2–3 series. | Colour scale choice matters — viridis/magma are colour-blind safe. |
| **Bar chart (Top N)** | Ranked lists: top endpoints by RPS, top queries by duration, top pods by memory. | Time series. Anything with > ~20 categories (becomes illegible). | Sort stability; pagination; tied values. |
| **Histogram / distribution** | Latency or duration distributions. P50/P95/P99 lines overlaid. | When a single summary number (p95) is enough. | Linear x-axis hides tail; log-scale usually wins for latency. |
| **Table with inline bars** | Lots of rows, comparable numeric column, need sort/filter (e.g., per-host list). | Fewer than ~5 rows — use stat cards. | Tabular-nums CSS is mandatory for alignment. |
| **Status dots / LED grid** | Service health at-a-glance — Uptime-Kuma-style wall of green/red. | When you need to convey *how* sick, not just up/down. | Don't rely on colour alone — shape/label required for accessibility. |
| **Log stream viewer** | Tail of recent events, errors, auth attempts. | Aggregate analytics (use a histogram). | Virtual scrolling is table stakes above ~500 lines; preserve scroll position during updates. |
| **Topology / graph (nodes+edges)** | Service dependency graph, tailnet mesh, container orchestrator. | > 50 nodes — becomes a hairball. | Layout stability across refreshes matters more than beauty. |
| **Geographic map** | Visitor origin, CDN edge locations, physical infrastructure. | When the location dimension isn't actionable. | Mercator distorts; use equal-area projections or D3 geoNaturalEarth. |
| **Sankey / flow** | Traffic-flow path analysis, funnel drop-off. | More than ~4 stages — visual noise explodes. | Hand-editable orderings are usually needed for clarity. |
| **Alert feed** | Chronological list of fires, grouped + ack-able. | Silent dashboards — put alerts in a distinct panel. | Avoid flashing; use pulsing dots + colour + icon. |
| **Activity / event timeline** | Deploys, config changes, incidents as a horizontal ribbon. | High-frequency events — cluster them. | Annotations should cross-cut all time-series panels (see §4). |

---

## 2. Layout Patterns

| Pattern | Example | Strengths | Weaknesses |
|---|---|---|---|
| **12-column grid dashboard** | [Grafana](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/), [Datadog](https://docs.datadoghq.com/dashboards/) | Predictable, drag-to-resize, proven. Datadog's "High Density Mode" on wide screens auto-packs widget groups side-by-side [DRUIDS](https://www.datadoghq.com/blog/engineering/druids-the-design-system-that-powers-datadog/). | Looks exactly like every other ops dashboard. Hard to express visual hierarchy. |
| **Bento / mosaic** | Apple product pages; [PostHog dashboards](https://posthog.com/docs/product-analytics/dashboards); bento admin kits ([SaaSFrame](https://www.saasframe.io/blog/designing-bento-grids-that-actually-work-a-2026-practical-guide)) | Asymmetric blocks create hierarchy. 67% of ProductHunt top-100 SaaS sites use some bento variant per [Orbix](https://www.orbix.studio/blogs/bento-grid-dashboard-design-aesthetics). Users complete tasks ~23% faster on modular layouts. | Hard to auto-generate from metric definitions; needs editorial judgement per dashboard. |
| **Sidebar + content** | [Vercel's dashboard](https://vercel.com/try/new-dashboard), [Tailscale admin](https://tailscale.com/kb/1155/terminology-and-concepts) | Scales to many machines/services. Keyboard-navigable. Vercel's sidebar collapses to give a tab full-screen focus. | Eats horizontal space on laptops; nested nav gets deep. |
| **Tabbed concerns** | "System \| Network \| Services \| Logs" — common in router admin, Proxmox, Coolify | Reduces cognitive load per view; each tab = one decision. | Breaks "single-page glance"; state per tab adds complexity. |
| **Drill-down hierarchy** | overview → per-machine → per-metric. Netdata, Datadog. | Matches operator mental model. | Requires URL-state discipline; back-button must work. |
| **Command palette (Cmd-K)** | Linear, Vercel, Raycast [Maggie Appleton on Command-K bars](https://maggieappleton.com/command-bar) | Keyboard-first, searches nav + actions + content. Power-user escape hatch. | Discoverability for casual users; needs a fallback. |
| **TV / NOC mode** | [Netdata TV mode](https://www.netdata.cloud/blog/tv-mode/), [Datadog TV mode](https://docs.datadoghq.com/dashboards/guide/tv_mode/), [SolarWinds NOC views](https://documentation.solarwinds.com/en/success_center/orionplatform/content/core-noc-views-dark-modern-dashboards.htm) | Strips chrome, uses dark theme, auto-rotates tabs (~15–60s default). Big type, high contrast from 10 feet away. | Needs separate layout — don't just zoom your laptop dashboard. |
| **Mobile-first drill** | Beszel mobile [XDA review](https://www.xda-developers.com/beszel-feature/), [Beszel Mobile app](https://www.basantasapkota026.com.np/2026/03/beszel-mobile-monitor-servers-from-your.html) | Triage from phone: alert → host detail → action. | Full charts don't translate; design a mobile-specific overview. |

**Rule of thumb:** pick ONE layout pattern per surface. A bento overview plus a grid drill-down is fine; a bento drill-down screen inside a grid overview is cognitive chaos.

---

## 3. Information Density Spectrum

Density is a deliberate design choice, not an accident. Both ends have a place.

| Density | Example | Best for |
|---|---|---|
| **Ultra-high (htop-tier)** | [Netdata](https://www.netdata.cloud/), htop, [Netdata vs Grafana comparison](https://www.netdata.cloud/comparisons/grafana/) | Incident response, "what is happening right now across 400 metrics". Netdata collects per-second and surfaces everything by default. |
| **High (Grafana-tier)** | Grafana default dashboards, Datadog High Density Mode | Steady-state ops monitoring where the operator already knows the layout. |
| **Medium (Beszel-tier)** | [Beszel](https://beszel.dev/), Coolify, Dokploy | Self-hosted homelab: a few dozen metrics you check while sipping coffee. |
| **Low (Plausible-tier)** | [Plausible](https://plausible.io/docs/guided-tour), Linear Insights, Vercel Analytics | One-page summary. "Understand your site in under a minute" per the Plausible guided tour. |

**Progressive disclosure** is the bridge: start low-density on the overview, reveal density on drill-down. Observability advice from [OpenObserve](https://openobserve.ai/blog/observability-dashboards/) and [Chronosphere](https://chronosphere.io/learn/observability-dashboard-experience/): *one page answers one on-call question*. If it can't, split it.

For a self-hosted personal/homelab site, medium density is the sweet spot — enough to feel substantive, not so much that it looks like you cloned a Grafana screenshot.

---

## 4. Interaction Patterns

| Pattern | Notes |
|---|---|
| **Time-range selector** | Presets (`5m / 1h / 6h / 24h / 7d / 30d / custom`). Grafana best-practice: default to the shortest useful window (15–60 min), provide fast preset switching. |
| **Global time sync** | All panels on a dashboard share ONE time range. Non-negotiable — desync breaks root-cause analysis. |
| **Zoom / pan / brush** | Drag-to-zoom on a chart zooms all panels. uPlot and ECharts support this natively; see [uPlot demos](https://leeoniya.github.io/uPlot/). |
| **Crosshair + shared tooltip** | Hovering any chart draws a vertical line on every chart at the same timestamp and shows all series values. Essentially mandatory for multi-panel dashboards. |
| **Click-through to context** | Click a spike → jump to logs / traces / query editor scoped to that window + series. Datadog and Honeycomb do this; it collapses the ops feedback loop. |
| **Filter chips** | Per machine, per service, per label. Linear's [dashboard-level filters](https://linear.app/docs/dashboards) propagate to every insight on the page. |
| **Favorites / pinned panels** | Beszel lets users pin and hide metrics. Respects "my homelab, my priorities". |
| **Annotations** | Vertical markers for deploys, incidents, maintenance. Grafana [annotations](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/annotate-visualizations/) and [Lightstep deployment markers](https://docs.lightstep.com/docs/create-deployment-markers) are the canonical implementations. Critical for answering "why did it spike?". |
| **Dashboard save/share URL** | All filter + time state in the URL — shareable, bookmarkable. See web/patterns.md's URL-as-state advice. |
| **Keyboard shortcuts** | `t` for time picker, `r` for refresh, `/` for search, `Cmd-K` for palette. Grafana, Linear, Vercel all converge on this. |

---

## 5. Real-Time Feel

The difference between feeling "live" and feeling "data-y" is mostly motion design.

- **Streaming vs. polling**: WebSocket or SSE beats hard `setInterval` refresh. Beszel uses PocketBase's real-time subscriptions [DeepWiki](https://deepwiki.com/henrygd/beszel); Netdata samples per-second.
- **Smooth shift vs. redraw**: as new data arrives, shift the chart left by one tick with a short CSS transform transition (≤ 200ms). Do NOT animate every data point re-render — flicker and GPU cost.
- **Pulse indicators**: small `●` with `box-shadow` scale animation at ~2s cycle on live panels. Subtle is the whole point — no strobing.
- **Reconnection UX**: when the socket drops, gray the live indicator, show a muted banner "reconnecting…", and never discard the last known state. On reconnect, refetch the visible time window rather than trusting the client to have buffered correctly.
- **Reduced-motion**: respect `prefers-reduced-motion` — disable sliding transitions, swap pulses for a static filled dot. See web/testing.md.

---

## 6. Colour & Visual Language

### Status palette

| Role | Default | Notes |
|---|---|---|
| OK / healthy | green (oklch ~ 65% 0.16 145) | Don't rely on hue alone — pair with a ✓ or label. |
| Warning | amber / yellow (oklch ~ 80% 0.14 85) | Ensure contrast on both light and dark backgrounds. |
| Error / critical | red (oklch ~ 60% 0.22 25) | Reserve for actual incidents. Overuse = alarm fatigue. |
| Info | blue (oklch ~ 65% 0.16 245) | Neutral informational content. |
| Unknown / stale | gray | Explicitly distinguishable from OK. |

~8% of men have red-green colour vision deficiency per [Grafana's best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/). Never rely on red-vs-green alone.

### Sequential / continuous scales

For heatmaps (CPU-per-core, latency buckets), use **viridis** or **magma** — both perceptually uniform in lightness and colour-blind safe. Per [sjmgarnier/viridis docs](https://sjmgarnier.github.io/viridis/), they "do not rely as much on red–green contrast" and stay legible in greyscale. Avoid jet/rainbow: perceptually non-uniform and misleading.

### Dark-mode primacy

The NOC/ops tradition is dark-by-default: less eye strain in long sessions, more contrast for emissive widgets, aligns with terminal tooling. But — per web/design-quality.md — don't *default* to dark for fashion. If you ship both, both must feel intentional, not a `color-scheme` toggle auto-inversion.

### Typographic hierarchy

- **Big metrics**: sans-serif or display face, large (clamp 2.5rem → 4rem), `font-variant-numeric: tabular-nums` — mandatory for any number that changes. Without tabular-nums, live-updating values jitter horizontally as digit widths change. See [theosoti on tabular-nums](https://theosoti.com/short/tabular-nums/) and [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-variant-numeric).
- **Labels**: smaller, higher contrast on dark backgrounds, often uppercase or small-caps for status labels.
- **Units**: de-emphasize (lower opacity, smaller size) so the numeric value reads first. `42 ms` not `42 ms`.

### Data-ink ratio (Tufte)

Applied to modern dashboards per [Tufte's sparkline writing](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/):

- Drop gridlines unless scanning a specific value matters.
- Drop legends if colour-coded labels sit on the chart itself.
- Drop chart frames / card borders — use whitespace and typography to separate panels.
- Sparklines have a data-ink ratio of 1.0 and belong next to every big-number card. Tufte: *"A number is meaningless without a trend line next to it."*

---

## 7. Design References to Steal From

| Product | URL | Signature move | What to borrow |
|---|---|---|---|
| **Vercel Analytics** | [vercel.com/try/new-dashboard](https://vercel.com/try/new-dashboard) | Respectful minimalism; collapsible sidebar; Cmd-K everywhere. | Whitespace discipline; developer-centric keyboard nav; monochrome charts with one accent. |
| **Linear Insights** | [linear.app/insights](https://linear.app/insights), [docs](https://linear.app/docs/dashboards) | Dashboard-level filters cascade to every insight. Modular charts/tables/single-number insights. | Shared-filter UX; fast, flat typography; purposeful single-dashboard-single-use-case rule. |
| **Plausible Analytics** | [plausible.io/docs/guided-tour](https://plausible.io/docs/guided-tour) | One screen = entire product. No sub-menus. Understand site in under a minute. | Aggressive scope reduction. Breakout-tab UI for referrers/pages/countries. |
| **Grafana** | [grafana.com](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/) | 12-col grid; template variables; annotations as first-class. | Time-range control, annotations, query-driven panels. Don't copy the default visual style — it's deliberately neutral. |
| **Netdata** | [netdata.cloud](https://www.netdata.cloud/) | Per-second density. Zero-config discovery. TV mode. | Real-time streaming feel, sparkline density, TV-mode layout. |
| **Datadog** | [docs.datadoghq.com/dashboards](https://docs.datadoghq.com/dashboards/) | "High Density Mode" on wide displays; widget groups; DRUIDS design system [blog](https://www.datadoghq.com/blog/engineering/druids-the-design-system-that-powers-datadog/). | Grouped widgets, grid resize snap behaviour, bulk-edit groups. |
| **Beszel** | [beszel.dev](https://beszel.dev/), [GitHub](https://github.com/henrygd/beszel) | Self-hosted sibling: React frontend, PocketBase backend, Docker stats, pin/hide UX, < 50MB mem agent. | This IS the archetype you're building. Study their panel layouts and the mobile app. |
| **Uptime Kuma** | [github.com/louislam/uptime-kuma](https://github.com/louislam/uptime-kuma) | Status-page grid of green/red dots. Simple, recognisable. | Status wall pattern for service health. |
| **Cal.com Insights** | [cal.com](https://cal.com/) | Clean SaaS aesthetic, Tremor-style charts. | Minimalist card + chart combos. |
| **PostHog** | [posthog.com](https://posthog.com/blog/posthog-as-a-dev-tool), [docs](https://posthog.com/docs/product-analytics/dashboards) | Dev-tool personality, hedgehog branding. Dashboard tiles stack to one column on mobile. AI-diff on refresh. | Personality injection, responsive tile stacking, "what changed since last refresh" summary. |
| **Coolify / Dokploy** | [coolify.io](https://coolify.io), [dokploy.com](https://dokploy.com/) | Self-hosted PaaS dashboards. Dokploy is cited as cleaner/more modern than Coolify ([LogRocket](https://blog.logrocket.com/dokploy-vs-coolify-production/)). | Resource organisation (apps / DBs / domains / backups); container-metric cards. |
| **Tailscale admin** | [tailscale.com](https://tailscale.com/kb/1155/terminology-and-concepts) | Machine list with clean IP/identity columns; ACL visualiser. | Table-as-primary-view for node lists. |

---

## 8. Anti-Patterns to Avoid

Based on [Grafana best-practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/), [logz.io top-10 mistakes](https://logz.io/blog/top-10-mistakes-building-observability-dashboards/), and [pencilandpaper UX pattern analysis](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards):

- **Rainbow chart syndrome** — 15 time-series in 15 hues. Nothing is legible. Cap at ~5 series or use small multiples.
- **Dashboard graveyard** — dashboards that nobody opens because there are 40 of them. Each dashboard should have an owner, a single purpose, and a review cadence.
- **Misleading y-axis starts** — zooming the axis to amplify noise. Start at zero unless there's a documented reason not to.
- **3D charts** — always wrong. Period.
- **Unlabeled axes / scales** — especially on shared screenshots. Include units.
- **Flashing alerts** — accessibility hazard and cortisol pump. Use pulsing at ≤ 2Hz, pair with sound only if the user opted in.
- **Gauge overuse** — a wall of five gauges communicates nothing a bar chart couldn't communicate better.
- **The "Bootstrap admin template" look** — blue sidebar, uniform cards, generic "Welcome back, User" header, Chart.js line with default blue. This is the exact trap web/design-quality.md flags.
- **Metric overload** — "just because you can collect it doesn't mean you should". Rendering hundreds of series kills the browser.
- **Auto-refresh too aggressive** — 1s refresh on a background tab burns battery and server. Default to 30s, pause when tab hidden.
- **Too many visualization types** — Grafana's data: using ≤ 3 viz types per dashboard increases comprehension by up to 63%.

---

## 9. Accessibility

Observability dashboards skew to technical audiences but still need to meet WCAG baselines.

- **Colour-blind safe palettes** — viridis/magma for continuous, Okabe-Ito or Paul Tol's schemes for categorical. Never red-vs-green alone — add icons (✓ ✗ ⚠) or text.
- **Contrast** — 4.5:1 minimum for text; verify on *both* theme variants.
- **Keyboard navigation** — tab order through panels, arrow-key navigation within charts, `Enter` to drill down, `Esc` to close overlays.
- **Reduced motion** — respect `prefers-reduced-motion`: disable chart slide animations, swap pulse dots for static, disable auto-rotate in TV mode.
- **Screen-reader patterns for charts** — per [MIT Vis Group research](https://vis.csail.mit.edu/pubs/rich-screen-reader-vis-experiences/) and [Chart Reader](https://alper.datav.is/publications/chartreader/):
  - Every chart ships a `<table>` equivalent (visually hidden or togglable).
  - `role="img" aria-label="CPU usage over last hour, ranging 12% to 78%, peaking at 15:42"`.
  - Sonification is emerging (Highcharts [accessibility demos](https://www.highcharts.com/blog/accessibility/)); optional but differentiating.
- **Focus rings** — visible, not suppressed. Terminal/brutalist aesthetics tend to strip them — don't.

---

## 10. Component Library Landscape

For 1000+ point streaming time-series specifically, canvas-based libs dominate.

| Library | License | Strengths | Streaming 1k+ points | Use when |
|---|---|---|---|---|
| **uPlot** | MIT — [github.com/leeoniya/uPlot](https://github.com/leeoniya/uPlot) | Canvas 2D, ~50KB. 166k points in 25ms cold; ~100k pts/ms after [README](https://github.com/leeoniya/uPlot). | Excellent — designed for this. | Live streaming dashboards, Beszel-style live charts. |
| **Apache ECharts** | Apache 2.0 — [echarts.apache.org](https://echarts.apache.org/) | Canvas renderer, 50+ chart types, solid defaults. | Very good — canvas handles large N. | Complex dashboards that need many chart types in one place. |
| **Recharts** | MIT | SVG, React-native composition, ~3.6M weekly downloads. | Poor above ~100 points. | Low-density, high-fidelity dashboards. |
| **Visx (Airbnb)** | MIT — [airbnb.io/visx](https://airbnb.io/visx/) | D3 primitives as React components, ~15KB modules. | Manual — you implement the perf. | Custom, brand-distinctive charts. |
| **Tremor** | Apache 2.0 — [tremor.so](https://www.tremor.so/) | Tailwind + Radix, dashboard-ready kits, ~50KB. | Limited (Recharts under the hood). | Fast SaaS-style dashboards using Tailwind. |
| **D3 directly** | ISC — [d3js.org](https://d3js.org/) | Total control; SVG/canvas; ecosystem. | Good with canvas; steep curve. | Bespoke visualisations nothing else can render. |
| **Highcharts** | Commercial (free non-commercial) | 15+ years mature, excellent accessibility + sonification. | Good. | Enterprise with budget + accessibility demands. |
| **Chart.js** | MIT — [chartjs.org](https://www.chartjs.org/) | Canvas, easy setup, responsive. | OK with streaming plugin. | Simple dashboards; not the design-distinctive choice. |
| **Nivo** | MIT — [nivo.rocks](https://nivo.rocks/) | Beautiful defaults, React-first, heavy. | Poor. | Pretty-out-of-the-box; small datasets. |
| **Observable Plot** | ISC — [observablehq.com/plot](https://observablehq.com/plot) | Grammar-of-graphics, concise API. | Moderate. | Exploratory / editorial visualisations. |

**Recommendation for a self-hosted multi-machine analytics site streaming live metrics:**
**uPlot** for time-series panels (CPU, RAM, RPS, latency sparklines), **ECharts** for heatmaps / sankey / topology if you need them, and **hand-coded SVG via Visx or plain React** for one or two signature widgets that define your visual identity. Skip Recharts and Chart.js unless you're optimising for development speed over design.

---

## 11. Three Design Directions

All three satisfy web/design-quality.md's anti-template policy and the required-qualities checklist. Pick one and commit to it.

### Direction A: "Terminal Ops"

**Mood:** serious, craft-forward, built-in-vim. Nods to [classic hacker terminal aesthetic](https://grokipedia.com/page/Classic_Hacker_Terminal_Aesthetic) without cosplaying it.

**Palette:**
```
bg           oklch(14% 0.01 230)    near-black, slight cool cast
surface      oklch(18% 0.01 230)
text         oklch(88% 0.01 120)    soft phosphor green-tinted off-white
muted        oklch(55% 0.01 230)
ok           oklch(74% 0.18 140)    phosphor green
warn         oklch(82% 0.16 90)     amber-phosphor
error        oklch(68% 0.22 25)
accent       oklch(74% 0.18 140)    match OK — the "on" colour
```

**Typography:** JetBrains Mono / Berkeley Mono / Commit Mono for data + labels. One optional sans (Inter Tight) for marketing pages only. Tabular-nums mandatory.

**Layout:** high-density grid, ASCII-box dividers (`─ │ ┌ ┐`) as section separators instead of card borders. Line-drawing sparklines like htop. Status dots as Unicode `●`.

**Example products:** [Netdata TV mode](https://www.netdata.cloud/blog/tv-mode/), [chyinan/terminal-ui-design-system](https://github.com/chyinan/terminal-ui-design-system), htop, btop, k9s.

**Pros:** highly distinctive; signals seriousness; dense by nature — great for homelab. **Cons:** risk of cosplay; needs discipline not to slide into "hacker movie UI"; mobile is harder with monospace.

---

### Direction B: "Editorial Tech"

**Mood:** calm, considered, Kottke-meets-Stripe. Big typography, big whitespace, charts treated as editorial figures.

**Palette:**
```
bg           oklch(98% 0.005 85)    warm near-white (light default)
surface      oklch(100% 0 0)
text         oklch(18% 0.005 85)
muted        oklch(48% 0.01 85)
ok           oklch(55% 0.14 145)    muted forest
warn         oklch(72% 0.14 70)     muted ochre
error        oklch(52% 0.18 25)     rust
accent       oklch(48% 0.16 250)    inky blue
```
Dark variant is a genuine companion, not an inversion: warm dark-taupe bg, cream text.

**Typography:** serif display (GT Super / Tiempos Headline / Söhne Breit) for page titles and metric values; sans (Inter Tight / Söhne / Söhne Mono for numbers) for labels. Tabular-nums for any live number.

**Layout:** bento overview, then a one-column editorial drill-down per machine with wide charts and generous top/bottom padding (`clamp(4rem, 3rem + 5vw, 10rem)` section spacing). Sparklines live inline in running text-like paragraphs ("Server `argon` served **412 req/s** [sparkline] over the last 24h.").

**Example products:** [Plausible](https://plausible.io/), [Linear Insights](https://linear.app/insights), [Vercel's new dashboard](https://vercel.com/try/new-dashboard), Stripe docs.

**Pros:** feels like a product, not a template; ages well; screenshots great. **Cons:** low density — wrong direction if you're pushing hundreds of metrics; serif on small data labels can be hard at 12px.

---

### Direction C: "Neo-Brutalist Infra"

**Mood:** bold, opinionated, unmistakable. Per [NN/g on neobrutalism](https://www.nngroup.com/articles/neobrutalism/) and [brutalism.plus](https://brutalism.plus/neobrutalism): thick borders, hard offset shadows, flat colour blocks, monospace headlines.

**Palette:**
```
bg           oklch(96% 0 0)          paper white
surface      oklch(100% 0 0)
text         oklch(12% 0 0)          near-black
ok           oklch(82% 0.22 140)     acid lime
warn         oklch(88% 0.20 95)      cadmium yellow
error        oklch(66% 0.26 25)      signal red
accent       oklch(72% 0.20 255)     electric blue
shadow       oklch(12% 0 0)          solid black, offset 4px / 4px
```

**Typography:** JetBrains Mono for everything data; a display sans (Space Grotesk / Departure Mono / PP Neue Bit) for headers. ALL-CAPS section labels. No tracking tightening.

**Layout:** bento grid with 2–4px solid black borders on every card; `box-shadow: 4px 4px 0 black` for hard offset. Tabs styled as push-buttons with pressed-state shift. Big numeric metrics in display type with heavy weight.

**Example products:** [Bruddle UI kit](https://www.whiteui.store/bruddle), [homayounmmdy/neo-brutalism-dashboard-template](https://github.com/homayounmmdy/neo-brutalism-dashboard-template), [v0 dashboards](https://v0.app/templates/dashboards) (some variants), [Code Info neo-brutalism dashboard](https://www.codeinfoweb.com/neo-brutalism-dashboard-html-css/).

**Pros:** zero chance of looking like a template; instantly recognisable on social shares; dark mode variant is striking. **Cons:** aggressive — not everyone's taste; heavy borders hurt the Tufte data-ink ratio; accessibility requires care on focus rings.

---

## Recommendation

For a **self-hosted multi-machine analytics site** targeting distinctive design:

1. **Layout**: bento overview → grid drill-down per host. Cmd-K palette for navigation between hosts. Sidebar only if you expect > ~10 machines.
2. **Density**: medium. Big-number + sparkline stat cards on overview; 6–9 focused panels on drill-down.
3. **Charting**: uPlot for streaming time-series; hand-rolled SVG for one signature widget (topology map or host grid).
4. **Interaction**: global time range, crosshair sync, URL state, annotations for deploys.
5. **Direction**: "Editorial Tech" if you want the site to read as a product; "Terminal Ops" if the audience is you-plus-nerds; "Neo-Brutalist Infra" if you want maximum distinctiveness and don't mind polarising.
6. **Reference architecture**: [Beszel](https://beszel.dev/) is the closest shape to what you're building — study its panel layout, pin/hide UX, and Docker stats handling before committing to your own structure.

---

## Source Index

- Beszel: [beszel.dev](https://beszel.dev/) · [GitHub](https://github.com/henrygd/beszel) · [DeepWiki](https://deepwiki.com/henrygd/beszel) · [noted.lol review](https://noted.lol/beszel/) · [XDA review](https://www.xda-developers.com/beszel-feature/) · [Beszel Mobile](https://www.basantasapkota026.com.np/2026/03/beszel-mobile-monitor-servers-from-your.html)
- Grafana best practices: [docs](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/) · [annotations](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/annotate-visualizations/) · [MetricFire 7 best practices](https://www.metricfire.com/blog/7-best-practices-for-grafana-dashboard-design/)
- Netdata: [netdata.cloud](https://www.netdata.cloud/) · [vs Grafana](https://www.netdata.cloud/comparisons/grafana/) · [TV Mode blog](https://www.netdata.cloud/blog/tv-mode/)
- Datadog: [dashboards docs](https://docs.datadoghq.com/dashboards/) · [TV mode](https://docs.datadoghq.com/dashboards/guide/tv_mode/) · [DRUIDS design system](https://www.datadoghq.com/blog/engineering/druids-the-design-system-that-powers-datadog/) · [effective dashboards repo](https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md)
- Observability dashboards guides: [OpenObserve](https://openobserve.ai/blog/observability-dashboards/) · [Chronosphere](https://chronosphere.io/learn/observability-dashboard-experience/) · [logz.io top-10 mistakes](https://logz.io/blog/top-10-mistakes-building-observability-dashboards/) · [Groundcover on Grafana](https://www.groundcover.com/learn/observability/grafana-dashboards) · [Dashboard Design Patterns catalog](https://dashboarddesignpatterns.github.io/patterns.html) · [Pencil & Paper UX analysis](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- Vercel: [new dashboard](https://vercel.com/try/new-dashboard) · [Medium analysis of developer-centric design](https://medium.com/design-bootcamp/vercels-new-dashboard-ux-what-it-teaches-us-about-developer-centric-design-93117215fe31) · [dashboard templates](https://vercel.com/templates/admin-dashboard)
- Linear: [Insights](https://linear.app/insights) · [Dashboards docs](https://linear.app/docs/dashboards) · [Best practices post](https://linear.app/now/dashboards-best-practices) · [Changelog](https://linear.app/changelog/2025-07-24-dashboards)
- Plausible: [guided tour](https://plausible.io/docs/guided-tour) · [Textify review](https://textify.ai/plausible-analytics-review-2026/)
- PostHog: [dashboards docs](https://posthog.com/docs/product-analytics/dashboards) · [PostHog as dev tool](https://posthog.com/blog/posthog-as-a-dev-tool)
- Uptime Kuma: [GitHub](https://github.com/louislam/uptime-kuma) · [status page wiki](https://github.com/louislam/uptime-kuma/wiki/Status-Page) · [grid-view issue](https://github.com/louislam/uptime-kuma/issues/968)
- Tailscale: [terminology](https://tailscale.com/kb/1155/terminology-and-concepts) · [topology mapper](https://tailscale.com/community/community-projects/tailscale-network-topology-mapper) · [Mobbin admin console screenshot](https://mobbin.com/explore/screens/bedfacb1-958b-40df-999d-308e76d8401f)
- Coolify / Dokploy: [dokploy.com](https://dokploy.com/) · [Coolify vs Dokploy – LogRocket](https://blog.logrocket.com/dokploy-vs-coolify-production/) · [Contabo comparison](https://contabo.com/blog/blog-coolify-vs-dokploy-comparison/) · [Cherry Servers](https://www.cherryservers.com/blog/coolify-vs-dokploy)
- Chart libraries: [uPlot](https://github.com/leeoniya/uPlot) · [uPlot site](https://leeoniya.github.io/uPlot/) · [Casey Primozic notes](https://cprimozic.net/notes/posts/my-thoughts-on-the-uplot-charting-library/) · [Tremor](https://www.tremor.so/) · [Visx](https://airbnb.io/visx/) · [Querio 2026 library comparison](https://querio.ai/articles/top-react-chart-libraries-data-visualization) · [Embeddable 6 best JS libs](https://embeddable.com/blog/javascript-charting-libraries) · [Metabase OSS comparison](https://www.metabase.com/blog/best-open-source-chart-library)
- Bento / design trends: [Orbix on bento dashboards](https://www.orbix.studio/blogs/bento-grid-dashboard-design-aesthetics) · [SaaSFrame 2026 practical guide](https://www.saasframe.io/blog/designing-bento-grids-that-actually-work-a-2026-practical-guide) · [Mockuuups examples](https://mockuuups.studio/blog/post/best-bento-grid-design-examples/)
- Neo-brutalism: [NN/g definition](https://www.nngroup.com/articles/neobrutalism/) · [brutalism.plus](https://brutalism.plus/neobrutalism) · [Bruddle UI kit](https://www.whiteui.store/bruddle) · [Neo-brutalism dashboard template](https://github.com/homayounmmdy/neo-brutalism-dashboard-template) · [Code Info example](https://www.codeinfoweb.com/neo-brutalism-dashboard-html-css/)
- Terminal aesthetic: [Classic Hacker Terminal Aesthetic (Grokipedia)](https://grokipedia.com/page/Classic_Hacker_Terminal_Aesthetic) · [Terminal UI design system](https://github.com/chyinan/terminal-ui-design-system) · [terminal green (IndieWeb)](https://indieweb.org/terminal_green)
- Tufte / data-ink: [Sparkline theory](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/) · [Principles of Data-Ink](https://jtr13.github.io/cc19/tuftes-principles-of-data-ink.html) · [Designing dashboards the Tufte way](https://medium.com/design-bootcamp/designing-efficient-dashboards-with-the-tufte-way-9209e79f2ffb)
- Colour / viridis: [viridis intro](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html) · [viridis colorblind-friendly](https://sjmgarnier.github.io/viridis/)
- Typography: [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-variant-numeric) · [theosoti on tabular-nums](https://theosoti.com/short/tabular-nums/) · [Caro Appleby tabular numbers](https://www.caro.fyi/articles/tabular-nums/)
- Accessibility: [MIT Rich Screen Reader Vis](https://vis.csail.mit.edu/pubs/rich-screen-reader-vis-experiences/) · [Chart Reader](https://alper.datav.is/publications/chartreader/) · [USWDS data viz](https://designsystem.digital.gov/components/data-visualizations/) · [Highcharts accessibility demos](https://www.highcharts.com/blog/accessibility/) · [Tenon on accessible charts](https://blog.tenon.io/accessible-charts-with-aria/)
- Command palette / TV mode: [Maggie Appleton Command-K bars](https://maggieappleton.com/command-bar) · [Mobbin command palette patterns](https://mobbin.com/glossary/command-palette) · [SolarWinds NOC views](https://documentation.solarwinds.com/en/success_center/orionplatform/content/core-noc-views-dark-modern-dashboards.htm) · [Screenful TV mode guide](https://screenful.com/guide/tv-mode)
- Annotations: [Grafana annotate visualizations](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/annotate-visualizations/) · [Lightstep deployment markers](https://docs.lightstep.com/docs/create-deployment-markers) · [OneUptime on Grafana annotations](https://oneuptime.com/blog/post/2026-01-28-grafana-annotations/view)
