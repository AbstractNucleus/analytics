# Analytics Panel — Research Index

Research gathered to inform building a self-hosted analytics site on a subdomain, primarily for the server **bserver**, with future expansion to additional machines via push-based agents.

---

## Context

- **Target audience:** one developer, self-hosted, personal fleet (1 → ~10 machines).
- **Primary host:** `bserver` (treated as generic Linux for research; confirm specifics during implementation).
- **Expansion plan:** add machines by installing a small agent binary that pushes metrics to the central hub.
- **Deployment:** subdomain, single-container friendly, wants a distinctive UI (anti-template per `rules/web/design-quality.md`).
- **Today's date at research time:** 2026-04-19.

---

## Documents

| # | Area | File | Scope |
|---|------|------|-------|
| 1 | Platforms landscape | [platforms/platforms-comparison.md](platforms/platforms-comparison.md) | 22 platforms compared (Grafana, Datadog, Netdata, **Beszel**, Zabbix, SigNoz, Uptime Kuma, etc.), signature UX patterns to steal, table-stakes feature list. |
| 2 | Metrics catalog | [metrics/metrics-catalog.md](metrics/metrics-catalog.md) | 11 categories of metrics (CPU, mem, disk, net, processes, services, logs, security, web, DB, hardware, efficiency) with *why it matters*, *viz type*, *alert threshold*. Ends with a Minimum Viable Dashboard of ~18 metrics. |
| 3 | Collection architecture | [architecture/collection-architecture.md](architecture/collection-architecture.md) | Push vs pull, agent options, transports, TSDB tradeoffs, retention/rollup math, alerting pipeline. Three reference architectures (Beszel-style, Prometheus+Grafana, OTel/SigNoz). |
| 4 | Dashboard UI/UX | [ui-patterns/dashboard-ui-patterns.md](ui-patterns/dashboard-ui-patterns.md) | 15 widget types, layout patterns (grid/bento/sidebar/drill-down), interaction patterns, colour/type system, 12 product references to steal from, chart library shootout, 3 distinct style directions. |
| 5 | Stack recommendations | [self-hosted/stack-recommendations.md](self-hosted/stack-recommendations.md) | Fork-vs-build analysis, 10+ OSS fork candidates evaluated, 5 from-scratch stack options, library picks, agent language comparison, phased effort estimate. |

Each document cites its sources at the end.

---

## Cross-cutting recommendation

Every stream independently converged on the same answer:

> **Fork or closely mirror [Beszel](https://github.com/henrygd/beszel).** It is the architectural sibling of what you are describing — a small Go hub + tiny Go agents that push over WebSocket (with SSH fallback), SQLite-backed, MIT-licensed, 20k+ stars, actively maintained.

### Recommended shape

| Layer | Pick | Why |
|-------|------|-----|
| **Agent** (per machine) | Go binary, single static, ~15–25 MB | Cross-compiles everywhere, no runtime on hosts, proven by Beszel / Prometheus / Telegraf. |
| **Transport** | Push over WebSocket, CBOR/protobuf payload, mTLS or ED25519 keys | Traverses NAT, agents initiate outbound, works from laptops on random Wi-Fi. |
| **Hub** | Single Go service on bserver, listens on one port | Matches your solo-dev / single-subdomain footprint. |
| **Storage** | SQLite with tiered rollups (raw → 1m → 10m → 1h → 1d) | Zero-ops, ~4 GB/year per host fits on any disk. |
| **Backend API** | REST + SSE for live dashboard push | SSE is simpler than WebSockets for one-way server→browser streams; browsers auto-reconnect. |
| **Frontend** | Your own SvelteKit / Next / React + Vite shell | This is where you earn the distinctive UI; don't reuse Grafana's look. |
| **Charts** | [uPlot](https://github.com/leeoniya/uPlot) | ~50 KB, MIT, 10× faster than Recharts on streaming series. Non-negotiable for live dashboards. |
| **Auth** | Passkeys (single-user) or Better Auth for small team | Lucia is in maintenance mode; Better Auth is the current recommendation. |
| **Reverse proxy / TLS** | Caddy on bserver | Auto-TLS on the subdomain, one config file. |
| **Deploy** | Docker Compose on bserver (hub + Caddy) | One `docker compose up`; add agents as you add machines. |

### The build-vs-fork call

Two viable paths, both documented in detail in [stack-recommendations.md](self-hosted/stack-recommendations.md):

1. **Run Beszel as-is, iterate on the frontend in a fork.** Fastest to production, keeps the battle-tested agent and hub, lets you replace the React/Recharts UI with your own design language over time. Effort: ~65–105h total across 3 phases.
2. **Build from scratch matching Beszel's shape.** Full control over every seam. Cost: several weeks more, especially on the agent's collector coverage (Beszel already ships cpu/disk/docker/gpu/smart/zfs/mdraid/sensors).

**Start with (1).** You can peel off and rewrite pieces as you learn. You cannot buy back the time spent rebuilding what already works.

---

## Phased roadmap

### Phase 1 — MVP (single machine, bserver only)
**Goal:** see bserver's vitals on your subdomain over HTTPS.

- Deploy Beszel hub on bserver behind Caddy
- Install Beszel agent locally (systemd unit)
- Core metrics visible: CPU %, per-core heatmap, mem used / `MemAvailable`, swap, disk % + IOPS + latency, network bandwidth per interface, load + PSI, uptime, temps
- Dark-mode-first UI, one-page dashboard, 24h default range with 1h / 7d / 30d toggles
- **Effort:** ~20–30h

### Phase 2 — Fleet (multi-machine)
**Goal:** add arbitrary machines; see them all at a glance.

- Agent install script for additional hosts (Linux first, Windows & macOS after)
- Fleet overview: one row per host with sparkline + status dot + quick links
- Per-host detail page with tabbed concerns (System / Network / Services / Logs)
- Tag / group filter (e.g. `home`, `vps`, `work`)
- Time-range linking across panels
- **Effort:** ~15–25h

### Phase 3 — Depth (logs, alerts, auth hardening)
**Goal:** catch problems before you notice them.

- Log stream viewer (journald / Docker)
- Threshold + PSI-based alerts with silences, delivered via ntfy or Telegram
- Healthchecks.io-style dead-man switch ("if an agent stops reporting for 2 min, page me")
- Auth: passkeys; session token per agent; optional SSO via Authentik if you add others
- HTTP vhost metrics if bserver runs nginx/Caddy for other sites
- Deploy annotations (mark chart when a deploy happens)
- **Effort:** ~30–50h

**Total: ~65–105h** to reach a personal analytics panel that out-performs most SaaS alternatives for your scale.

---

## What to borrow from each product

From [platforms-comparison.md](platforms/platforms-comparison.md), the cross-product winners:

- **Beszel** — fleet table with inline sparklines; pin/hide hosts; the whole shape.
- **Netdata** — per-second fidelity, anomaly detection, unreasonably dense first screen.
- **Grafana Node Exporter Full (#1860)** — complete panel set to mine for metric ideas.
- **Uptime Kuma** — status-grid aesthetic, public status page, notification matrix.
- **Datadog** — High Density Mode (same dashboard serves laptop + NOC TV).
- **Vercel / Linear / Plausible** — low-density, editorial-tech dashboard design language.

---

## Open decisions for the user

These should be answered before Phase 1 starts:

1. **Fork Beszel or build parallel?** (Recommendation: fork.)
2. **Frontend framework?** Beszel ships React+Vite. Stick with it, or swap to SvelteKit for your own fork? SvelteKit has smaller bundles; React has more familiarity for most devs.
3. **Style direction?** Three options in [dashboard-ui-patterns.md §11](ui-patterns/dashboard-ui-patterns.md) — *Terminal Ops*, *Editorial Tech*, *Neo-Brutalist Infra*. Pick one early; retro-fitting visual language is expensive.
4. **bserver OS?** Confirmed Linux flavour / init system determines agent install story.
5. **Subdomain plan?** e.g. `analytics.yourdomain.tld`. Caddy config depends on this.
6. **Which other machines eventually?** Windows laptop, Mac, VPS? Affects agent cross-compile priorities.

Once these are answered, the next step is to scaffold Phase 1 and stand up the hub on bserver.
