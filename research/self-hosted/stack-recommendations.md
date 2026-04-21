# Self-Hosted Server Analytics Panel — Stack Recommendations

Opinionated research covering fork/adapt candidates, from-scratch stack options, key library picks, agent language choice, and a single strong recommendation. Written for a solo developer standing up a branded analytics subdomain that starts with one box (`bserver`) and eventually fans out to 1–10 push-reporting machines.

Data as of April 2026.

---

## 1. Fork / adapt candidates

Stars and license data pulled live from the GitHub API. Evaluation framing: how close is this to the user's goal of a self-hosted, push-agent, multi-machine analytics panel with room for design polish?

### 1.1 Beszel — **top candidate**

- **Repo:** https://github.com/henrygd/beszel
- **Stars:** 20,978 · **License:** MIT · **Latest:** v0.18.7 (2026-04-05)
- **Stack:** Go (hub + agent), React 19 + Vite + Tailwind CSS 4 + Recharts (frontend), PocketBase/SQLite (backend/auth/storage), CBOR-encoded payloads over WebSocket (primary) or SSH (fallback).
- **Architecture:** Classic hub-and-spoke. The hub is a single Go binary that embeds PocketBase (auth, admin, collections, realtime, S3-compatible backups) and serves the React SPA. Agents are separate Go binaries with modular subsystem collectors (`cpu.go`, `disk.go`, `docker.go`, `gpu.go`, `smart.go`, `zfs.go`, `network.go`, `sensors.go`, `battery`, `mdraid`, `systemd`). `ConnectionManager` in the agent handles dual-protocol transport; `SystemManager` / `AlertManager` / `RecordManager` live in the hub.
- **Fit to user's goals:** Extremely high. Push-agent with WebSocket transport, Docker stats, alerts, OAuth/OIDC, multi-user, automatic backups. Already MIT-licensed, actively maintained, small codebase. Exactly the shape of product the user wants.
- **Effort to fork/extend:** **LOW–MEDIUM.** The agent is already production-grade — leave it alone. The hub is PocketBase-flavored Go. The frontend is a normal React 19 + Tailwind app and the single most viable surface to restyle. Swapping Recharts for uPlot or ECharts is a localized change under `internal/site/src/components/charts`.
- **Keep:** agent binary, collectors, ConnectionManager, PocketBase hub, alert system, OAuth/OIDC, CBOR transport.
- **Change:** restyle the frontend against the user's own design language (the current UI is functional but generic shadcn/Recharts), potentially add custom routes for the marketing/landing surface on the subdomain.

### 1.2 SigNoz

- **Repo:** https://github.com/SigNoz/signoz
- **Stars:** 26,577 · **License:** "NOASSERTION" on GitHub (actually MIT for core, Enterprise under SigNoz Enterprise License) · **Latest:** active.
- **Stack:** Go Query Service, TypeScript/React frontend, ClickHouse storage, custom-forked OpenTelemetry Collector, Alertmanager.
- **Architecture:** True observability platform. OTel Collector ingests OTLP → writes to ClickHouse → Query Service serves React frontend.
- **Fit:** Way too heavy. This is a Datadog alternative, not a server-vitals panel. ClickHouse alone eats more RAM than the user's target agent footprint. Forking SigNoz to monitor one-to-ten boxes is like buying a combine harvester for a window box.
- **Effort to fork/extend:** **HIGH.** The frontend is customizable in place, but the operational burden of ClickHouse + Collector + Query Service + Alertmanager is the tax you pay forever.
- **Verdict:** Use as a **backend** for an OTel-native alternate design (see Option 2e), but don't fork.

### 1.3 Netdata

- **Repo:** https://github.com/netdata/netdata
- **Stars:** 78,508 · **License:** GPL-3.0 (agent) + NCUL1 (dashboard).
- **Stack:** C core, cloud-oriented UI.
- **Fit:** Incredibly feature-rich and fast, but the whole product is designed around Netdata Cloud, and the dashboard license (NCUL1) is not OSI-compliant. Forking the C core to build your own brand is a multi-month project and you still don't get a shippable frontend under a friendly license.
- **Effort to fork/extend:** **HIGH** (actively hostile to meaningful forks).
- **Verdict:** Skip.

### 1.4 Uptime Kuma

- **Repo:** https://github.com/louislam/uptime-kuma
- **Stars:** 85,469 · **License:** MIT · **Stack:** Node.js + Express + Vue 3 + Vite + Bootstrap 5, socket.io realtime, SQLite.
- **Architecture:** Three-tier. Server entry at `server/server.js`, Vue SPA communicates exclusively over socket.io for live updates. Targets 20-second monitor intervals.
- **Fit:** Great UX reference. Wrong problem domain — pure uptime/protocol checks, not per-host metrics. No agent, no push. The visual polish and status-page flows are worth stealing as design inspiration.
- **Effort to fork/extend:** **HIGH** (you'd be rewriting the data model from HTTP probes into host metrics, which is most of the work).
- **Verdict:** Don't fork. Do mine the UX — notification channels, status pages, monitor-detail views.

### 1.5 Dozzle

- **Repo:** https://github.com/amir20/dozzle
- **Stars:** 12,420 · **License:** MIT · **Stack:** Go backend, Vue 3 frontend, SSE/WebSocket streaming, gRPC between hub and remote agents.
- **Fit:** Architecturally the most similar lightweight Go+SPA pattern to Beszel, but focused on log tailing. Excellent reference for "how to do a single-binary Go hub with a modern frontend and gRPC agents."
- **Effort to fork/extend:** **MEDIUM–HIGH** — you'd keep the shell and replace the entire log domain with metrics. Not worth it if Beszel exists.
- **Verdict:** Reference, don't fork. Steal the agent-over-gRPC pattern if you later want structured log tailing.

### 1.6 Glances

- **Repo:** https://github.com/nicolargo/glances
- **Stars:** 32,299 · **License:** GPL-3.0 · **Stack:** Python + psutil, built-in web mode (FastAPI + vanilla JS).
- **Fit:** Excellent single-host htop-style tool with a web mode, but not designed as a multi-host hub. The web UI is a utility, not a product.
- **Effort:** **HIGH** to extend into a centralized hub.
- **Verdict:** Skip. Use `psutil` directly if you ever need a Python reference implementation.

### 1.7 Grafana

- **Repo:** https://github.com/grafana/grafana
- **Stars:** 73,296 · **License:** AGPL-3.0.
- **Fit:** Forking Grafana is a career, not a side project. AGPL makes it a viral license for anything you ship on top. Still an option if you stand up Grafana + Prometheus behind your brand and reskin via themes and a custom landing shell.
- **Effort to fork:** **VERY HIGH.** Effort to consume as a backend and iframe/API-proxy from a custom shell: **MEDIUM.**
- **Verdict:** Don't fork. See build-from-scratch Option 2d.

### 1.8 Healthchecks.io

- **Repo:** https://github.com/healthchecks/healthchecks
- **Stars:** 9,981 · **License:** BSD-3-Clause · **Stack:** Django + Postgres.
- **Fit:** Cron/heartbeat focused. Great for "did this job run?" but not for continuous metrics. Could be an interesting secondary feature to bolt on for scheduled-task monitoring, but not a panel skeleton.
- **Verdict:** Skip for primary skeleton. Consider borrowing the heartbeat pattern if you want scheduled-job monitoring later.

### 1.9 OpenObserve

- **Repo:** https://github.com/openobserve/openobserve
- **Stars:** 18,587 · **License:** AGPL-3.0 · **Stack:** Rust core + Vue 3 frontend, single binary, claims 140× lower storage than Elasticsearch.
- **Fit:** Full logs/metrics/traces platform. AGPL is the killer for a branded product. Architecturally interesting (Rust single binary + object storage), but the surface area is huge.
- **Verdict:** Skip. Good to watch.

### 1.10 HertzBeat

- **Repo:** https://github.com/apache/hertzbeat
- **Stars:** 7,172 · **License:** Apache-2.0 · **Stack:** Java/Spring Boot + Vue.
- **Fit:** JVM footprint is fatal for a lightweight homelab panel. "Agentless" (SNMP/HTTP probes) is the wrong model for what the user wants.
- **Verdict:** Skip.

### 1.11 Nezha (bonus — surfaced during search)

- **Repo:** https://github.com/nezhahq/nezha
- **Stars:** 9,920 · **License:** Apache-2.0 · **Stack:** Go + Vue.
- **Fit:** Very similar shape to Beszel (Go hub + Go agent) with community skins like Komari. Smaller community, primarily Chinese-language docs, but a legitimate alternative if you don't like Beszel's PocketBase coupling.
- **Verdict:** Secondary fork candidate if Beszel doesn't click.

### Tailwind-admin boilerplates

Skip. Generic admin templates violate the user's own anti-template policy (`rules/web/design-quality.md`). They bias you toward sidebar-and-cards layouts. Build the frontend against your own design direction.

---

## 2. Build-from-scratch stack options

Four opinionated stacks with honest pros/cons. The user's `development-workflow.md` mandates research-and-reuse first, so each option below is explicit about what libraries do the heavy lifting.

### Option A — Next.js + tRPC + Postgres/TimescaleDB + Node agent

- **Frontend:** Next.js 15 (App Router) + Tailwind CSS 4 + shadcn/ui + uPlot for charts
- **Backend:** tRPC or route handlers, Drizzle ORM
- **Database:** Postgres with the TimescaleDB extension (hypertables for metrics)
- **Agent:** Node.js using `systeminformation` + `dockerode`, posting to an ingest endpoint over HTTPS
- **Deployment:** Docker Compose on `bserver` behind Caddy
- **Pros:** One language end-to-end. The user is almost certainly fluent in TS/Next. Postgres is ubiquitous, and TimescaleDB's SQL ergonomics make aggregates trivial.
- **Cons:** Node agent is 50–80 MB installed vs ~15 MB Go binary, and needs a Node runtime on every monitored box. Next.js is overkill for a mostly-dashboard app where SSR doesn't buy much. Postgres + Timescale is a heavier DB story than SQLite for 1–10 machines.
- **When it wins:** You want to ship a product, not a system daemon. The subdomain hosts marketing/landing + app, and Next covers both.

### Option B — SvelteKit + Go agent + SQLite (Beszel-like, from scratch)

- **Frontend:** SvelteKit + Tailwind CSS 4 + uPlot (or ECharts)
- **Backend:** SvelteKit server routes OR a separate Go service using Fiber/Echo
- **Database:** SQLite via libSQL, or PocketBase embedded if you want auth/admin bundled
- **Agent:** Go, cross-compiled to Linux/amd64, Linux/arm64, Windows, macOS
- **Deployment:** Single container per service, Caddy reverse proxy, systemd unit for the agent on each box
- **Pros:** Tiny runtime footprint on every box. Go agent cross-compiles trivially. SvelteKit ships less JS than Next. SQLite on the hub scales fine to 1–10 machines and even 1–100 with Timescale-esque partitioning.
- **Cons:** Two-language stack (Go + TS). You write the agent domain logic yourself instead of adopting Beszel's.
- **When it wins:** You want the Beszel architecture but your own product identity and you specifically want to avoid PocketBase. Otherwise, fork Beszel.

### Option C — Astro/Remix + Hono backend + LibSQL/Turso + Rust agent

- **Frontend:** Astro 6 for marketing + islands for the live dashboard, OR Remix for a more app-first posture
- **Backend:** Hono on Bun (runs equally well on Node)
- **Database:** LibSQL locally, or Turso-hosted for free-tier replication
- **Agent:** Rust with `sysinfo` + `bollard` for Docker
- **Deployment:** Docker Compose for hub, static Rust binary per host
- **Pros:** Fashionable 2026 stack. Astro's content-first model pairs well with a marketing + dashboard subdomain. Hono is extremely small and edge-deployable if you ever go that way. Rust agent is the smallest, lowest-memory binary you can ship.
- **Cons:** Rust is a commitment. Writing and maintaining a cross-platform Rust agent is real work compared to Go. Three runtimes (Bun, Rust, browser) means more moving parts.
- **When it wins:** You genuinely want to learn Rust on this project. If the agent language is a means, not the end, Go is the smarter call.

### Option D — Grafana + Prometheus + custom thin UI shell

- **Frontend:** Your own Next/SvelteKit landing + dashboard shell, iframing or API-proxying Grafana panels
- **Backend:** Grafana + Prometheus + node_exporter + cAdvisor for Docker
- **Database:** Prometheus TSDB (plus optional Thanos/Mimir for long retention)
- **Agent:** `node_exporter` (pull) or `prometheus-pushgateway` + an `exporter` wrapper (push-ish)
- **Deployment:** Docker Compose stack
- **Pros:** You inherit the world's best metrics visualization for free. Huge library of exporters (node, cAdvisor, smartctl, mysqld, nginx, ...). Zero custom code for the chart layer.
- **Cons:** Grafana is pull-model by default, which conflicts with the user's "push agent" requirement — you'd run `node_exporter` on each box and have Prometheus scrape them, which means the hub needs network access *into* each monitored box (or you run Prometheus-agent on each box in remote-write mode, which is closer to push). You're always going to be fighting Grafana whenever your design diverges from its defaults. Iframes are an aesthetic dead end.
- **When it wins:** You care about metrics power more than product identity. For this user's goals, it doesn't win.

### Option E — OpenTelemetry + SigNoz backend + custom frontend

- **Ingestion:** OpenTelemetry Collector running on each host (host-metrics receiver, docker-stats receiver, filelog receiver)
- **Backend:** Self-hosted SigNoz (ClickHouse + Query Service)
- **Frontend:** Custom Next.js app querying SigNoz's ClickHouse-backed API, OR direct ClickHouse from your API layer
- **Deployment:** Docker Compose (heavy stack — ClickHouse wants RAM)
- **Pros:** Standards-based. OpenTelemetry agent is battle-tested and covers metrics/logs/traces forever. If you outgrow 10 machines, this stack scales to thousands.
- **Cons:** ClickHouse baseline memory is a tax the user will pay every month. OTel Collector config is YAML-heavy. Massive overkill for `bserver` + a handful of friends' boxes.
- **When it wins:** This is a real business, not a personal panel. For 1–10 machines: no.

---

## 3. Key library picks (independent of stack)

### 3.1 Time-series charting

Benchmark context: 3,600 points at 60 fps — uPlot uses ~10% CPU and 12 MB RAM; Chart.js uses ~40% / 77 MB; ECharts uses ~70% / 85 MB. Recharts collapses above ~5,000 points because it renders every point as SVG.

- **uPlot** — smallest (~20 KB), fastest for live-streaming metric feeds. Sparse docs but stable API. **Recommendation: use this for the main live chart surface.** ([GitHub](https://github.com/leeoniya/uPlot), [demo](https://leeoniya.github.io/uPlot/))
- **Apache ECharts** — most features (heatmaps, candlesticks, sankey, map), dual canvas/SVG. Best when you need variety in one app. ~900 KB minified, tree-shakable. Good second pick.
- **Recharts** — SVG-based, React-only, great DX for <1,000-point dashboards. Beszel uses this. Fine for low-density widgets, not for scrolling multi-hour charts.
- **Tremor** — dashboard components built on Recharts. Convenient kit if you want a pre-baked bento feel, but inherits Recharts' scaling limits. Skip unless you want the layout primitives.

**Pick:** uPlot for live charts, ECharts for anything uPlot can't render (heatmaps, flame graphs later). Skip Recharts unless you're forking Beszel and don't want to touch its chart layer yet.

### 3.2 Real-time transport

For a dashboard where the server pushes updates and the client rarely pushes back:

- **SSE** — default. HTTP-based, works through every proxy, auto-reconnects, plays nicely with HTTP/2 multiplexing. For dashboards that tick every 1–10 seconds, SSE is the operational sweet spot.
- **WebSocket** — use only if you add interactive features (terminal, live command, remote exec). Mandatory for the agent↔hub channel because you need bidirectional messaging.
- **Long/short polling** — only as a last-resort fallback.

**Pick:** SSE browser ↔ hub, WebSocket (or gRPC) agent ↔ hub. This is exactly what Beszel and Dozzle both do, for good reason.

### 3.3 Auth

Single-user / tiny-team personal panel:

- **Better Auth** — 2026 de-facto standard for TS apps. Built-in passkeys, OAuth, 2FA, magic links, Drizzle/Prisma adapters. Lucia's maintainer now recommends it as the successor.
- **Lucia** — officially in maintenance mode as of March 2025 per Lucia's own announcement. Do not start new projects on it.
- **Auth.js (NextAuth)** — fine if you're on Next, but heavier API and less passkey-native than Better Auth.
- **Clerk** — hosted, not self-hosted. Contradicts the user's subdomain-on-own-infra goal.
- **Authentik / Authelia** — full IdPs. Overkill for one user, right size if you already run multiple self-hosted apps and want SSO across them. Authelia is lighter and specializes in forward-auth; Authentik is more feature-complete.
- **PocketBase built-in auth** — if you fork Beszel or build on PocketBase, you already have password, OAuth, and OIDC. Ship with it.

**Pick:** if forking Beszel, use PocketBase auth + add a passkey provider. From scratch, use Better Auth. If you already run Authelia/Authentik, put the whole panel behind forward-auth and skip app-level auth.

### 3.4 Deployment

- **Docker Compose on bserver** — simplest and correct choice. One `docker-compose.yml` with the hub, Caddy, and anything else.
- **Coolify** (51k stars, ~5–7% idle CPU) — full-featured self-hosted PaaS. Worth it if you plan to host several apps and want a dashboard for all of them.
- **Dokploy** (31k stars, ~350 MB idle, <1% CPU) — lighter, deploys Docker Compose natively as-is. Better for a single-VPS side project.
- **Bare systemd unit** — valid, slightly tedious. Use for the **agent** on each monitored host (a systemd unit for a Go binary is one file).

**Pick:** Docker Compose + Caddy on `bserver`. Systemd unit for the agent on each host. Consider Dokploy only if you want a deploy UI across multiple projects.

### 3.5 Reverse proxy / TLS

- **Caddy** — automatic Let's Encrypt, HTTP/3, tiny config, Docker label integration. The correct default in 2026 for self-hosting.
- **Nginx** — more performant at the extreme high end, but you'll fight Certbot renewals and verbose config for zero practical benefit at this scale.
- **Traefik** — more features than Caddy for complex Docker Compose setups, steeper learning curve.

**Pick:** Caddy, no debate. Subdomain (e.g., `analytics.example.com`) → Caddy on `bserver` → hub container.

---

## 4. Agent language choice

The agent runs as a daemon on every monitored machine. Metrics that matter: binary size, RSS, cross-compile ergonomics, cold start, ecosystem for system introspection.

| Language | Binary size | Cold start | RSS | Cross-compile | System introspection libs | Hiring-yourself cost |
|---|---|---|---|---|---|---|
| **Go** | ~15 MB static | <10 ms | 10–30 MB | `GOOS=linux GOARCH=arm64 go build` | `gopsutil`, `dockerode`/`docker/client`, NVML bindings — vast | Low |
| **Rust** | 2–6 MB stripped | <5 ms | 3–10 MB | `cross` or targets via rustup | `sysinfo`, `bollard`, `nvml-wrapper` — good | High |
| **Zig** | ~0.5–3 MB | <5 ms | 2–8 MB | First-class, built-in | Thin — you'll write shims | Very High |
| **Node** | ~50–80 MB (incl. runtime) | 80–300 ms | 60–120 MB | Needs Node installed everywhere | `systeminformation`, `dockerode` | Low |
| **Python** | ~100+ MB (incl. runtime) | 150–400 ms | 40–100 MB | psutil works everywhere, but needs Python | `psutil`, `docker` SDK | Low |
| **Bash-only** | 0 (scripts) | n/a | n/a | Portable-ish | `ps`, `df`, `/proc`, `docker stats` | Low initially, high over time |

**Recommendation: Go.**

- Beszel, Prometheus node_exporter, Telegraf, cAdvisor, Datadog Agent, and Grafana Alloy all independently picked Go for the same reason: a single static binary with stable ABI, sub-millisecond startup, reliable cross-compilation, and a `gopsutil` ecosystem that covers 95% of host metrics out of the box.
- Rust wins on absolute size/memory but loses on time-to-ship and library breadth. The ~5 MB you save per install doesn't justify doubling your development time.
- Zig is an experiment, not a dependency choice for a production agent.
- Node/Python agents force a runtime onto every monitored host. Unacceptable.
- Bash is a trap — fine for the first 20 lines, unmaintainable at 200.

If you fork Beszel, you inherit its Go agent. If you build from scratch, use Go and borrow Beszel's collector layout as a reference under its MIT license.

---

## 5. Opinionated recommendation

### The call

**Fork Beszel. Keep the Go agent and PocketBase hub untouched. Rewrite the frontend against your own design language.**

### Why

- **Solo developer, finite hours.** The user's own rules mandate research-and-reuse before building. Beszel solves 80%+ of the problem: push agent, WebSocket transport, Docker stats, alerts, OAuth, multi-user, backups, 1–10 machine scale. Rebuilding it would take weeks and not produce anything better at the backend layer.
- **MIT license.** You can restyle, rebrand, close-source extensions, whatever. No AGPL or NCUL1 landmines.
- **Active maintenance.** v0.18.7 shipped two weeks before this report. The user inherits upstream agent improvements (new GPU vendors, new collectors) while owning their frontend fork.
- **Design-quality guardrails.** The user's `rules/web/design-quality.md` forbids generic template UI. Beszel's current React+Tailwind+Recharts frontend is functional but generic — exactly the surface where a solo developer's design investment produces the biggest product identity win. This is the leverage point.
- **Push-agent first, subdomain-native.** Deploy the hub on `bserver` behind Caddy at `analytics.yourdomain.com`. Point the first agent at the hub over WebSocket. Everything else is additive.

### Fallbacks

- If you strongly dislike PocketBase or want Postgres from day one, build Option B (SvelteKit + Go agent + SQLite or Postgres) and port Beszel's agent collectors under MIT attribution.
- If you want to learn Rust and accept the time penalty, Option C.
- If you've already been considering an observability career pivot, Option E with SigNoz — but that's a different project.

### Phase plan

**Phase 1 — MVP on `bserver` (single machine)**

- Fork Beszel to `github.com/<you>/<name>`.
- Stand up the hub in Docker Compose on `bserver` behind Caddy at the target subdomain.
- Install the beszel-agent as a systemd unit on `bserver` itself; verify metrics flowing.
- Create a branded landing shell for the public route — hero, status summary card, marketing copy — separate from the logged-in dashboard.
- Replace Beszel's chart components with a uPlot-based layer for the live CPU/RAM/disk/network panels.
- Apply the user's own design language (real typography pairing, intentional palette, bento layout for the dashboard) per `rules/web/design-quality.md`.
- Enable passkey auth via PocketBase; disable password auth if you only want passkeys.
- Smoke-test alerts for CPU/disk thresholds to email or Discord webhook.

*Estimated effort: **20–30 hours.*** Almost all of it is design and frontend; the backend is a deploy-and-configure exercise.

**Phase 2 — Multi-machine**

- Deploy agents to additional hosts (2–10). Write a one-liner installer script that pulls the right arch binary and registers via a join token.
- Add a systems-list view grouped by tag/environment.
- Add per-host alert policies and aggregate views (stacked CPU across fleet, worst-5 disks).
- Add a public status-page route (read-only, no auth) for anything you want to expose.

*Estimated effort: **15–25 hours.*** Mostly UX iteration; the agent just works.

**Phase 3 — Logs, richer alerts, auth hardening**

- Add log tailing. Either (a) bolt Dozzle alongside in the same Compose stack and iframe its detail view into the panel, or (b) add a log-tail collector to the agent using a file-watch plugin and stream to the hub over the existing WebSocket.
- Expand alerting channels: email (done via PocketBase SMTP), Discord, Slack, ntfy, generic webhook. Add alert deduping/flap detection.
- Auth hardening: require passkey + TOTP, add audit log, move session storage to an ephemeral table with short TTL, add rate limit on login.
- Add scheduled-job heartbeat endpoints (lift the Healthchecks.io pattern — a dead-simple POST receiver with interval expectations).
- Optional: migrate SQLite to `litestream` replicating to S3/R2 for durability.

*Estimated effort: **30–50 hours.*** The log subsystem is the bulk; everything else is small, high-value polish.

### Total

**Phase 1 + 2 + 3 ≈ 65–105 hours.** A conservative solo pace of 8 h/week puts Phase 1 at ~3 weeks, Phase 2 at ~2–3 weeks, Phase 3 at ~1–1.5 months of evening/weekend time. Call it ~3 months start-to-real-product if you stay disciplined, with a usable Phase 1 panel live on `bserver` inside the first month.

---

## Sources

- [Beszel — GitHub](https://github.com/henrygd/beszel) (stars 20,978, MIT, v0.18.7)
- [Beszel DeepWiki architecture](https://deepwiki.com/henrygd/beszel)
- [SigNoz — GitHub](https://github.com/SigNoz/signoz) (stars 26,577)
- [SigNoz technical architecture](https://signoz.io/docs/architecture/)
- [Netdata — GitHub](https://github.com/netdata/netdata) (stars 78,508, GPL-3.0 + NCUL1)
- [Uptime Kuma — GitHub](https://github.com/louislam/uptime-kuma) (stars 85,469, MIT)
- [Uptime Kuma DeepWiki](https://deepwiki.com/louislam/uptime-kuma)
- [Dozzle — GitHub](https://github.com/amir20/dozzle) (stars 12,420, MIT)
- [Dozzle agent mode](https://dozzle.dev/guide/agent)
- [Glances — GitHub](https://github.com/nicolargo/glances) (stars 32,299)
- [Grafana — GitHub](https://github.com/grafana/grafana) (stars 73,296, AGPL-3.0)
- [Healthchecks.io — GitHub](https://github.com/healthchecks/healthchecks) (stars 9,981, BSD-3-Clause)
- [OpenObserve — GitHub](https://github.com/openobserve/openobserve) (stars 18,587, AGPL-3.0)
- [HertzBeat — GitHub](https://github.com/apache/hertzbeat) (stars 7,172, Apache-2.0)
- [Nezha — GitHub](https://github.com/nezhahq/nezha) (stars 9,920, Apache-2.0)
- [uPlot — GitHub](https://github.com/leeoniya/uplot)
- [Best JS chart libraries 2026 — Luzmo](https://www.luzmo.com/blog/best-javascript-chart-libraries)
- [ClickHouse vs TimescaleDB 2026](https://tasrieit.com/blog/clickhouse-vs-timescaledb-2026)
- [PocketBase vs Supabase comparison](https://www.leanware.co/insights/supabase-vs-pocketbase)
- [Better Auth — the de facto standard for Astro auth in 2026](https://www.honogear.com/en/blog/engineering/best-auth-option-2026)
- [Authelia vs Authentik 2026 — Cerbos](https://www.cerbos.dev/blog/authelia-vs-authentik-2026-idp)
- [Lucia Auth discussion — maintenance mode](https://github.com/lucia-auth/lucia/discussions/1231)
- [Coolify vs Dokploy 2026 — Contabo](https://contabo.com/blog/blog-coolify-vs-dokploy-comparison/)
- [Caddy reverse proxy in 2025/2026 — Virtualization Howto](https://www.virtualizationhowto.com/2025/09/caddy-reverse-proxy-in-2025-the-simplest-docker-setup-for-your-home-lab/)
- [Traefik vs Caddy vs Nginx — virtua.cloud](https://www.virtua.cloud/learn/en/concepts/traefik-caddy-nginx-docker-reverse-proxy)
- [Prometheus push vs pull — SigNoz](https://signoz.io/guides/is-prometheus-monitoring-push-or-pull/)
- [WebSocket vs SSE vs long polling — Algomaster](https://blog.algomaster.io/p/polling-vs-long-polling-vs-sse-vs-websockets-webhooks)
- [Rust vs Go vs Zig — Better Stack](https://betterstack.com/community/guides/scaling-go/rust-vs-go-vs-zig/)
- [Thoughts on Go vs Rust vs Zig — Sinclair Target](https://sinclairtarget.com/blog/2025/08/thoughts-on-go-vs.-rust-vs.-zig/)
