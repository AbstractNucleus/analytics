# Server / Infrastructure Monitoring Platforms: Comparison & Inspiration

A survey of the major analytics and monitoring dashboard platforms, aimed at a solo developer building a self-hosted analytics site for one server (`bserver`) with a push-based agent model and room to add more machines.

The goal is twofold:

1. Understand what exists so you don't reinvent poorly.
2. Identify UX patterns, features, and architectural choices worth stealing.

---

## TL;DR

If you only read one section, read [Synthesis](#synthesis).

- The strongest single inspiration for a solo-dev push-based panel is **Beszel**. It is architecturally almost exactly what you are building.
- **Netdata** is the reference for "real-time single-node dashboard done right."
- **Grafana + Node Exporter (dashboard 1860)** is the reference for panel depth — what a power user expects to eventually drill into.
- **SigNoz** is the modern opinionated take on "all three signals in one app" and worth studying for information architecture.
- **Uptime Kuma** shows how a tiny self-hosted tool can still look genuinely polished.

---

## Comparison Matrix

| Platform | Self-hosted | SaaS | Model | Agent | License | Best at |
|----------|-------------|------|-------|-------|---------|---------|
| Grafana | Yes | Yes (Cloud) | Either | n/a (viz only) | AGPLv3 | Dashboarding any data source |
| Datadog | No | Yes | Push | Agent | Proprietary | Polished UX, breadth |
| New Relic | No | Yes | Push | Agent | Proprietary | APM, golden signals |
| Netdata | Yes | Yes (Cloud) | Push-parent / local | Agent | GPLv3 | Per-second real-time UI |
| Prometheus | Yes | via Cloud | Pull | Exporter | Apache 2.0 | Metrics TSDB |
| Zabbix | Yes | No | Pull + Push | Agent | AGPLv3 (7.0+) | Enterprise breadth, free |
| Nagios Core / XI | Yes | No | Pull (checks) | Plugin-based | GPLv2 / Proprietary | Legacy alerting |
| Checkmk | Yes | No | Pull (+ push) | Agent | GPLv2 (Raw) / Proprietary (Ent) | Large heterogeneous fleets |
| Cockpit | Yes | No | Agentless local | n/a | LGPLv2.1 | Admin console per host |
| Glances | Yes | No | Local or push | Python agent | LGPLv3 | Terminal-first quick view |
| Uptime Kuma | Yes | No | Active probes | n/a | MIT | Uptime + status pages |
| SigNoz | Yes | Yes | Push (OTel) | OTel collector | MIT (core) | Full observability, OTel-native |
| VictoriaMetrics + vmui | Yes | Yes | Pull + push | Exporters / vmagent | Apache 2.0 | Long-term metrics storage |
| Munin | Yes | No | Pull | Munin-node | GPLv2 | Simple, old-school |
| Node Exporter Full (1860) | Yes | - | Pull (via Prom) | node_exporter | Apache 2.0 | Reference Linux host dashboard |
| Observium / LibreNMS | Yes | No | SNMP poll | SNMP | QPL/Proprietary + GPLv3 | Network gear |
| Beszel | Yes | No | Push | Go agent | MIT | Lightweight multi-host homelab |
| Dozzle | Yes | Yes (Cloud) | Stream | n/a (Docker API) | MIT | Live container logs |
| Portainer CE / BE | Yes | No | Agent/agentless | Optional | Zlib (CE) / Prop (BE) | Container management UI |
| Plausible | Yes | Yes | JS pixel | n/a | AGPLv3 | Privacy-first web analytics |
| Umami | Yes | Yes | JS pixel | n/a | MIT | Simple web analytics |
| Fathom | No (Lite abandoned) | Yes | JS pixel | n/a | Proprietary | Simple web analytics |

---

## Infrastructure / Server Monitoring

### Grafana (+ Grafana Cloud)

- **Summary**: The de facto open dashboarding layer. Doesn't store data itself — visualizes from Prometheus, Loki, InfluxDB, Postgres, ClickHouse, and 150+ other sources.
- **Model**: Agentless at the Grafana layer. You pair it with a metrics store.
- **Signature UX**: Drag-to-zoom time range selection, panel library, variable-driven dashboards, explore mode, unified alerting UI.
- **Steal**: Dashboard-as-JSON, variables, panel legends with last/min/max/avg columns, "Explore" mode as a first-class alternative to dashboards, consistent time-range picker across every surface.
- **Weaknesses**: No built-in collection; you must run your own pipeline. Performance on very dense dashboards can degrade. Alert UI has been reworked multiple times.
- **License**: AGPLv3 (OSS); Enterprise add-ons commercial.
- **Repo**: https://github.com/grafana/grafana

### Datadog

- **Summary**: The gold standard for SaaS observability UX across metrics, logs, traces, RUM, security.
- **Model**: Push. Agent on every host, plus 900+ integrations.
- **Signature UX**: Host map (hex grid colored by a chosen metric), Watchdog anomaly detection, "Golden signals" per service, deep-linking between metrics → logs → traces.
- **Steal**: The host map is the single most-copied visualization in the industry; drill-through from service summary to trace in one click; tag-driven navigation.
- **Weaknesses**: Expensive at scale ($15–$23/host/mo + metric overage, log indexing, APM tiers). Vendor lock-in through proprietary agent. Even OTel metrics get billed as "custom."
- **License**: Proprietary SaaS.

### New Relic

- **Summary**: APM-first observability platform, priced per user + ingest.
- **Model**: Push. Agent (infrastructure agent + language APM agents) or OTel.
- **Signature UX**: Entity explorer, "automap" for upstream/downstream dependencies, "timewarp" for historical state, golden signals filters on tables of hosts/services.
- **Steal**: Treat every monitored thing as an "entity" with a consistent entity page (overview → metrics → logs → events → related). Let users compare a set of entities side-by-side on a golden-signals table.
- **Weaknesses**: Pricing model (user-based + ingest) surprises people. UI has grown busy over years.
- **License**: Proprietary SaaS.

### Netdata

- **Summary**: Per-second real-time, zero-configuration, ML-per-metric agent with a built-in dashboard.
- **Model**: Push. Each node runs the agent; "Parents" aggregate. Netdata Cloud (optional) federates views.
- **Signature UX**: A dashboard that auto-populates hundreds of charts the instant you install; charts scrub together when you drag; 18-model anomaly indicator per metric.
- **Steal**: Zero-config first run. Linked time scrubbing across every chart on the page. Small, dense charts grouped by subsystem with a sticky right-rail navigator. Per-metric anomaly badge instead of only dashboard-level alerts.
- **Weaknesses**: The sheer density can overwhelm. Cloud vs agent feature split has caused some community friction. Resource usage is low but not trivial on tiny boxes.
- **License**: GPLv3.
- **Repo**: https://github.com/netdata/netdata

### Prometheus

- **Summary**: The de facto metrics TSDB and scrape engine.
- **Model**: Pull. Prometheus scrapes HTTP `/metrics` endpoints exposed by exporters.
- **Signature UX**: The Prometheus UI itself is minimal — query + graph. The real UX is whatever is on top (usually Grafana).
- **Steal**: PromQL as a query language. Exporter ecosystem. Alertmanager's grouping / silencing / routing model is still best-in-class.
- **Weaknesses**: Pull model is awkward for ephemeral / NAT'd hosts (you need `push_gateway` or to flip to something like `vmagent` remote-write). Long-term storage requires a sidecar (Thanos, Cortex, Mimir, VictoriaMetrics).
- **License**: Apache 2.0.
- **Repo**: https://github.com/prometheus/prometheus

### Zabbix

- **Summary**: Heavyweight, all-in-one open-source monitoring with enterprise features and no license cost.
- **Model**: Both pull and push; agents, agentless (SNMP, IPMI), HTTP, JMX.
- **Signature UX (7.x)**: Dashboard widgets including gauges, pie, honeycomb (hex grid of hosts), top-triggers, widget-to-widget communication, geo-maps, SLA tracking.
- **Steal**: Honeycomb widget is great for "N hosts at a glance." Widget-to-widget parameter passing is a clean UX pattern (select a host in one widget → another widget re-scopes).
- **Weaknesses**: Heavy to run and learn. UI is functional but dated by modern standards. Configuration is template-driven and can feel rigid.
- **License**: AGPLv3 from 7.0 onward (previously GPLv2).
- **Repo**: https://github.com/zabbix/zabbix

### Nagios Core / Nagios XI

- **Summary**: The legacy granddaddy of host/service state monitoring. Still widely deployed.
- **Model**: Active checks (pull) via plugins; passive checks supported.
- **Signature UX**: Green/red/yellow service-state grid. Nagios XI adds config wizards, GUI configuration, reporting, BPI.
- **Steal**: The state grid (hosts × services matrix) is crude but effective. Hard-coded OK/WARN/CRITICAL/UNKNOWN states are easy to reason about.
- **Weaknesses**: Core is almost unusable without wrappers; XI is commercial (~$2,595 / 100 nodes Standard). Aesthetically stuck in the 2000s. Config is file-based in Core.
- **License**: GPLv2 (Core), Proprietary (XI).

### Checkmk

- **Summary**: A Nagios descendant that rebuilt the core for performance and usability; 2,000+ plugins, distributed monitoring.
- **Model**: Primarily pull; agent-based with autodiscovery of services.
- **Signature UX**: Views driven by tag-based host filters, service discovery wizard that proposes what to monitor, clean light/dark theming in recent versions.
- **Steal**: Service discovery as a UX pattern — "we found these 47 things, accept all / pick some." Tag-based host grouping.
- **Weaknesses**: Enterprise pricing (from ~$1,980/yr). Raw edition is functional but Enterprise features (including the fast core) are paywalled.
- **License**: GPLv2 (Raw Edition), Proprietary (Enterprise, Cloud, MSP).
- **Repo**: https://github.com/Checkmk/checkmk

### Cockpit

- **Summary**: Red Hat's browser-based admin console for individual Linux hosts.
- **Model**: Agentless (uses systemd, NetworkManager, etc. on the target).
- **Signature UX**: Per-server dashboard with CPU/memory/network/disk graphs, logs (journal), services (systemd), storage, networking, VMs, updates — all in one web UI per host.
- **Steal**: The information density on the host overview is a good reference: four quadrants (Health / Usage / Configuration / System) summarizing a box.
- **Weaknesses**: Not a fleet dashboard. Multi-host support is more "switch between hosts" than "aggregate."
- **License**: LGPLv2.1.
- **Repo**: https://github.com/cockpit-project/cockpit

### Glances

- **Summary**: Python cross-platform top/htop replacement with a web UI and REST API.
- **Model**: Local agent; can expose web UI, push to InfluxDB / Prometheus, or run in client/server mode.
- **Signature UX**: Terminal-style one-screen view: CPU, load, mem, network, disks, per-process, Docker, sensors.
- **Steal**: Color-coded thresholds (green/yellow/red) that apply per metric instead of only per alert. Compact "one screen tells you everything" density.
- **Weaknesses**: Web UI is a direct port of the terminal UI — not designed for multi-host. No historical view by itself.
- **License**: LGPLv3.
- **Repo**: https://github.com/nicolargo/glances

### Uptime Kuma

- **Summary**: Self-hosted "Is it up?" monitor with status pages and a genuinely nice UI.
- **Model**: Active probes (HTTP, TCP, ping, DNS, Docker, keyword, JSON query, Steam, gRPC, 20s min interval).
- **Signature UX**: Per-monitor "heartbeat" bar, 90-day uptime %, SSL expiry countdown, public status page builder, 95+ notification channels.
- **Steal**: The heartbeat bar is iconic — a single row of tiny green/red segments reading left to right. Per-monitor "last X checks" sparkline. Status page that you can publish for customers.
- **Weaknesses**: No metrics / logs / traces; purely uptime. Single-node (though v2 is more scalable). SQLite can struggle at very large monitor counts.
- **License**: MIT.
- **Repo**: https://github.com/louislam/uptime-kuma

### SigNoz

- **Summary**: Open-source, OTel-native observability platform. Positioned as a Datadog alternative.
- **Model**: Push via OpenTelemetry collectors; ClickHouse as storage.
- **Signature UX**: Unified metrics / logs / traces with flamegraphs and Gantt charts, query builder, exceptions view, LLM observability.
- **Steal**: OpenTelemetry as the ingest contract (future-proof). Query builder that works identically across signals. One URL per trace / log / metric for sharing.
- **Weaknesses**: Heavier to self-host (ClickHouse). Smaller plugin ecosystem than Grafana.
- **License**: MIT (community), Proprietary (enterprise).
- **Repo**: https://github.com/SigNoz/signoz

### VictoriaMetrics + vmui

- **Summary**: A high-performance Prometheus-compatible TSDB with its own built-in UI.
- **Model**: Supports both pull (scrape) and push (remote-write). `vmagent` is the common push-side collector.
- **Signature UX (vmui)**: Query tab with MetricsQL + autocomplete, multi-query overlay on one graph, raw-samples tab, cardinality explorer, WITH-expressions playground, relabel debugger, alerts/rules pagination.
- **Steal**: The debugger tabs (raw, relabel, WITH, cardinality) are gold for anyone who's ever debugged a Prometheus setup. Add-query-to-same-graph is a better UX than Grafana's "edit panel" flow for quick exploration.
- **Weaknesses**: vmui is a power-user tool; not a dashboard product. No turnkey "here's my server" view.
- **License**: Apache 2.0.
- **Repo**: https://github.com/VictoriaMetrics/VictoriaMetrics

### Munin

- **Summary**: The old-school RRDtool-based monitoring tool. Simple, plugin-driven, still runs.
- **Model**: Pull. `munin-node` on each host, central `munin` polls every 5 minutes.
- **Signature UX**: Static HTML pages full of small graphs, one per plugin, grouped by category. Day / week / month / year tiles per metric.
- **Steal**: The 4-up "day/week/month/year" thumbnail layout per metric is actually a timeless way to show a metric at multiple scales at once.
- **Weaknesses**: Feels very 2005. 5-minute resolution. Static pages. Scaling pain past a few dozen hosts. Minimal alerting.
- **License**: GPLv2.
- **Repo**: https://github.com/munin-monitoring/munin

### Grafana "Node Exporter Full" dashboard (1860)

- **Summary**: Not a product but a canonical dashboard — the reference for "what a Linux host dashboard looks like."
- **Stack**: `node_exporter` (Prometheus exporter, Apache 2.0) → Prometheus → Grafana with dashboard 1860.
- **Signature UX**: ~20 rows of panels grouped into CPU, Memory Basic, Memory Detailed, Network, Disk/Filesystem, Temperature, System misc; variables for job / host; fast server switching via dropdown.
- **Steal**: The row grouping is a great default taxonomy. The use of variables to turn one dashboard into N host dashboards is a pattern worth copying.
- **Weaknesses**: Dashboard-as-JSON drift over time; panel set has been forked 100+ ways; requires the full Prom + Grafana stack.
- **Dashboard**: https://grafana.com/grafana/dashboards/1860-node-exporter-full/

### Observium / LibreNMS

- **Summary**: SNMP-first network monitoring tools, focused on switches, routers, APs.
- **Model**: SNMP polling + some agent support.
- **Signature UX**: Port-level throughput graphs, autodiscovery, device maps, BGP/OSPF views. LibreNMS has distributed polling.
- **Steal**: The device → port drill-down model is useful for any "parent/child entity" hierarchy.
- **Weaknesses**: Observium went semi-proprietary. LibreNMS UI is rich but dense and dated.
- **License**: Observium — QPL (community), proprietary (pro); LibreNMS — GPLv3.
- **Repos**: https://github.com/librenms/librenms

### Beszel

- **Summary**: A lightweight, modern-looking, self-hosted, push-based multi-host monitor. Architecturally near-identical to what the user is building.
- **Model**: Push. A `hub` (PocketBase-backed web app) receives metrics from `agent`s running on each host (SSH-key-style pairing).
- **Signature UX**: Clean tile-style list of systems with colored health badges; detail page per system with CPU / RAM / disk / network / temperature / GPU / battery / Docker container stats and historical charts; alerts + SMTP; optional Flutter mobile app (2026).
- **Steal**: Damn near everything. Specifically:
  - PocketBase as a quick backend for auth, config, and a REST/realtime API.
  - Agent binary per host that dials home rather than being scraped — ideal for consumer internet / NAT.
  - System list view that reduces each host to a single row: name, status dot, key metrics, sparkline.
  - Per-container stats shown inline with host stats.
  - Sub-50 MB RAM, <1% CPU target for the agent.
- **Weaknesses**: Small project (single maintainer). Alert rules are fairly basic. No logs / traces. No pluggable data sources.
- **License**: MIT.
- **Repo**: https://github.com/henrygd/beszel
- **Site**: https://beszel.dev/

### Dozzle

- **Summary**: Real-time container log viewer. Tiny, fast, self-hosted.
- **Model**: Streams from the Docker API. Multi-host via gRPC agents.
- **Signature UX**: `tail -f` in the browser, across containers and hosts, with search, per-container alert expressions, in-browser shell (`docker exec`), DuckDB-WASM SQL over logs.
- **Steal**: A logs pane that feels as light as a terminal, not like an enterprise log product. DuckDB-in-the-browser for querying without a log backend is a neat pattern for small deployments.
- **Weaknesses**: Docker-only. No long-term retention (it streams; doesn't store).
- **License**: MIT.
- **Repo**: https://github.com/amir20/dozzle

### Portainer (CE / Business)

- **Summary**: The dominant web UI for Docker / Swarm / Kubernetes.
- **Model**: Agent or agentless; connects to Docker/K8s APIs.
- **Signature UX**: Environments list → per-env dashboard (containers, images, volumes, networks, stacks) → per-resource detail with logs, stats, console.
- **Steal**: Environments abstraction (one UI, many Dockers). Stack-as-a-compose-file editor. Live container stats page as a reference for real-time host-level metrics.
- **Weaknesses**: CE license is custom (Zlib-derived). Many features (RBAC, activity logs, edge) gated to Business.
- **License**: Zlib-based custom (CE), Proprietary (BE).
- **Repo**: https://github.com/portainer/portainer

---

## Web / App Analytics (for contrast)

These aren't infrastructure monitors — they track web visitors — but the user asked for a brief contrast. The lesson they carry is *restraint*: one clear dashboard, privacy by default, no session replay bloat.

### Plausible

- **Summary**: Privacy-first, cookieless web analytics. Single-page dashboard.
- **Model**: JS pixel → Elixir backend → ClickHouse.
- **Steal**: Everything-on-one-page dashboard; no tabs, no 14 panels. Source / page / country / device in a 2×2 grid. Fast and opinionated.
- **License**: AGPLv3.
- **Repo**: https://github.com/plausible/analytics

### Umami

- **Summary**: Lightweight privacy-first web analytics, Postgres-backed.
- **Steal**: MIT-licensed (easy to adapt). Simple to self-host on a Postgres you already have.
- **License**: MIT.
- **Repo**: https://github.com/umami-software/umami

### Fathom

- **Summary**: SaaS-only simple web analytics. Fathom Lite (self-host) is effectively abandoned.
- **Takeaway**: Ignore for self-hosted. Interesting only as a design reference for a stripped-down UI.

---

## Synthesis

### Top 3–4 inspirations for your build

1. **Beszel** — this is your direct reference implementation. Same problem, same scale, same architectural choice (push agent → central hub). Study its data model, PocketBase usage, agent protocol, and UI before writing code.
2. **Netdata** — study for density and real-time feel. Per-metric anomaly badge, linked time scrubbing, zero-config first run.
3. **Grafana + Node Exporter Full (1860)** — study for panel taxonomy and depth. When your user wants to drill in, this is the bar.
4. **Uptime Kuma** — study for the look and feel of a small, self-hosted project that still feels polished. Heartbeat bar, tidy cards, sensible defaults.

Bonus: **SigNoz** for info architecture if you ever add logs or traces, and **VictoriaMetrics' vmui** for the query-debugger pattern.

### Common UX patterns across the winners

- **One row per host in a fleet view**, with a status dot, 3–4 inline mini-metrics, and a sparkline or heartbeat bar. Beszel, Uptime Kuma, Datadog host map, New Relic entity list all converge here.
- **One detail page per entity**, with tabs or row sections: Overview → Compute → Memory → Disk → Network → Containers → Logs → Alerts. Cockpit, Netdata, Datadog, New Relic, SigNoz all use this shape.
- **Linked time scrubbing** across every chart on a page — drag on one, all of them re-range. Netdata is the canonical example; Grafana does it via the shared time picker.
- **Sparkline + single big number** as the atomic KPI unit, repeated everywhere.
- **Tag / label-driven filtering** as the grouping primitive, not nested folders. Datadog, New Relic, Prometheus, Checkmk.
- **Dashboard-as-JSON / config-as-code** so panels are diffable, shareable, and backup-friendly.
- **Light + dark mode with real discipline** (not just a CSS invert). Uptime Kuma, Beszel, SigNoz, newer Checkmk all do this.
- **Per-metric anomaly or threshold state** surfaced inline on the chart, not only as a separate alerts page.
- **Share-link for any view** (URL-encoded time range, filters, selected entity). Datadog and Grafana both lean hard on this; it's table-stakes for debugging in chat.

### Table-stakes features for any modern monitoring panel

Bare minimum, in rough priority order:

1. **Authenticated web UI** with at least session + API tokens; TOTP a bonus.
2. **Push-based agent** with a tiny binary, single config file, and auto-reconnect.
3. **Fleet list** page that answers "is anything broken?" in under 2 seconds.
4. **Per-host detail** with CPU, memory, disk (per mount), network (per iface), load avg, uptime, and basic process/container list.
5. **Historical metrics** for at least 30 days with a sensible downsampling story.
6. **Alerting** with thresholds, hysteresis, notification channels (email, webhook, ntfy, Discord, Slack at minimum), and silences.
7. **Time range picker + linked scrubbing** across charts on a page.
8. **Shareable, URL-encoded view state** (time range, filters, host).
9. **Status page** (public or team-visible) derived from the same data.
10. **Export / API** — REST or Prometheus-compatible, so power users can pipe data into Grafana if they want.
11. **Sensible dark mode** from day one.
12. **Import / export of dashboards and alert rules** as JSON or YAML, so config is portable.

Stretch goals that separate a hobby project from a "this feels like a real product":

- Container-aware metrics out of the box (Docker + Podman).
- Logs pane (even if it's just `journald` tailing; Dozzle-style).
- Mobile-friendly layout, or a tiny companion app.
- Anomaly/outlier indicator per metric, not just threshold alerts.
- SSO / OIDC if you want any team use.
- A plugin or webhook surface so you're not the bottleneck on new integrations.

---

## Sources

- Grafana OSS: https://grafana.com/oss/grafana/
- Grafana Node Exporter Full dashboard: https://grafana.com/grafana/dashboards/1860-node-exporter-full/
- Grafana repo: https://github.com/grafana/grafana
- Datadog pricing: https://www.datadoghq.com/pricing/
- Datadog pricing analysis: https://sedai.io/blog/datadog-cost-pricing-guide
- New Relic infrastructure UI docs: https://docs.newrelic.com/docs/infrastructure/infrastructure-data/infrastructure-ui-pages/infra-ui-overview/
- New Relic Advance 2026: https://newrelic.com/blog/news/new-relic-advance-2026
- Netdata features: https://www.netdata.cloud/features/
- Netdata repo: https://github.com/netdata/netdata
- Prometheus docs: https://prometheus.io/
- Prometheus Alertmanager: https://prometheus.io/docs/alerting/latest/alertmanager/
- Zabbix 7 new features: https://www.zabbix.com/whats_new_7_0
- Zabbix AGPLv3 announcement: https://blog.zabbix.com/striking-the-right-balance-zabbix-7-0-to-be-released-under-agplv3-license/27596/
- Nagios Core vs XI: https://www.nagios.com/article/nagios-core-vs-nagios-xi/
- Checkmk: https://checkmk.com/
- Checkmk alternatives (SigNoz): https://signoz.io/comparisons/checkmk-alternatives/
- Cockpit: https://cockpit-project.org/
- Cockpit intro (Red Hat): https://www.redhat.com/en/blog/intro-cockpit
- Glances: https://nicolargo.github.io/glances/
- Uptime Kuma: https://github.com/louislam/uptime-kuma
- Uptime Kuma guide (Better Stack): https://betterstack.com/community/guides/monitoring/uptime-kuma-guide/
- SigNoz repo: https://github.com/SigNoz/signoz
- SigNoz vs Datadog: https://signoz.io/product-comparison/signoz-vs-datadog/
- VictoriaMetrics docs: https://docs.victoriametrics.com/
- VictoriaMetrics vmui: https://github.com/VictoriaMetrics/vmui
- Munin competition page: https://munin-monitoring.org/munin-competition/
- LibreNMS vs Observium: https://insolvo.com/development-and-it/it-support-testing/observium-vs-librenms
- Beszel site: https://beszel.dev/
- Beszel repo: https://github.com/henrygd/beszel
- Beszel review (XDA): https://www.xda-developers.com/beszel-feature/
- Dozzle: https://dozzle.dev/
- Dozzle repo: https://github.com/amir20/dozzle
- Portainer CE vs BE: https://www.portainer.io/blog/portainer-community-edition-ce-vs-portainer-business-edition-be-whats-the-difference
- Portainer repo: https://github.com/portainer/portainer
- Plausible vs Umami (SelfHostWise, 2026): https://selfhostwise.com/posts/self-hosted-website-analytics-in-2026-umami-vs-plausible-complete-guide/
- Umami vs Plausible vs Matomo: https://aaronjbecker.com/posts/umami-vs-plausible-vs-matomo-self-hosted-analytics/
- Homelab stack 2026: https://blog.elest.io/the-2026-homelab-stack-what-self-hosters-are-actually-running-this-year/
