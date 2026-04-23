# Phase 1 MVP — design spec

Status: approved 2026-04-23.

Supersedes: nothing. Informed by [decisions.md](../decisions.md) and [research/](../research/).

Scope bound: this spec is one unit of shipped work. Phases 2 (alerts/logs/auth hardening) and 3 (deploy annotations, SSO, etc.) are explicitly deferred.

---

## Goal

Stand up `analytics.noelkleen.com` on bserver — a self-hosted, single-user analytics dashboard for a fleet of four machines — accessible only over the user's Tailscale tailnet, with a custom SvelteKit frontend styled per the AbstractNucleus editorial design system.

Done = (a) the compose stack runs on bserver, (b) the custom dashboard loads over HTTPS on the tailnet, (c) all four agents report in, (d) per-host panels render live data at ~1 Hz.

---

## Architecture

Hybrid: **Beszel's backend unchanged, custom SvelteKit frontend.**

```
┌──────────────── bserver (Ubuntu 24.04) ─────────────────┐
│                                                         │
│  caddy ────► TLS + reverse proxy                        │
│    │           │                                        │
│    │           ├─► frontend (SvelteKit / adapter-node)  │
│    │           │       │                                │
│    │           │       └─► PocketBase SDK (REST + SSE)  │
│    │           │                                        │
│    │           └─► (admin, gated) beszel-hub PB UI      │
│    │                                                    │
│    ▼                                                    │
│  beszel-hub (PocketBase, pinned docker image)           │
│    ▲                                                    │
│    │ WebSocket push                                     │
│    │                                                    │
│  beszel-agent (bserver's own)                           │
└─────────────────────────────────────────────────────────┘
           ▲                  ▲                  ▲
           │ WebSocket push over Tailscale       │
           │                  │                  │
       agent (laptop)     agent (pi)         agent (desktop)
       Arch Linux         ARM Linux          Windows
```

- **Data plane:** unchanged Beszel hub + agents. Pinned docker image tag, no fork.
- **Control plane:** our SvelteKit app reads via PocketBase's REST API for initial loads and subscribes to its realtime channel (SSE under the hood via the `pocketbase` JS SDK) for per-second updates.
- **Network boundary:** Caddy binds to bserver's tailnet IP only. DNS A record points to that IP (gray cloud, DNS-only — proxied mode breaks tailnet routing). TLS via Cloudflare DNS-01.
- **No app-level auth.** Tailnet is the boundary. Beszel's PocketBase admin UI stays on an internal docker network, reachable via `docker exec` or a side tunnel only when needed.

---

## Non-goals (deferred)

Explicitly out of scope for Phase 1, listed here to prevent scope creep during implementation:

- Threshold / PSI-based alerts, silences, notification channels.
- Dead-man switch ("if an agent stops reporting for 2 min, page me").
- Log stream viewer (journald / Docker).
- Deploy annotations (vertical markers on charts at deploy timestamps).
- SQLite backup strategy for Beszel's hub data.
- App-level auth (passkeys, SSO).
- Deep historical views beyond Beszel's default retention rollups.
- Fleet-level tags / groups (`home`, `work`, `vps`).
- Public status page.
- High-density "NOC TV" mode.

---

## Fleet

| Host | OS | Role |
| ---- | -- | ---- |
| `bserver` | Ubuntu 24.04 LTS | Hub + first agent |
| Laptop | Arch Linux | Agent |
| Raspberry Pi | Linux (ARM) | Agent |
| Home desktop | Windows | Agent |

All three Linux hosts run systemd. Only the laptop runs Arch — install scripts must not assume distro-specific package managers. The Beszel agent is a static Go binary; distro detection is unnecessary, but CPU architecture (amd64 vs arm64) detection is.

---

## Repo layout

```
analytics/
├── app/                         # SvelteKit frontend
│   ├── src/
│   │   ├── lib/
│   │   │   ├── beszel/          # thin PocketBase SDK wrapper (typed getters + subscribe)
│   │   │   ├── design/          # tokens, fonts, theme store
│   │   │   ├── chart/           # uPlot wrapper + tween/format helpers
│   │   │   ├── format/          # tabular numbers, thin-space thousands, relative time
│   │   │   └── panels/          # CPU/Memory/Disk/Network/Temps panel components + fleet row
│   │   ├── routes/
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte     # fleet view
│   │   │   └── hosts/[slug]/+page.{server,svelte}.ts
│   │   └── app.html             # data-theme attr + preload Roboto Mono
│   ├── static/fonts/            # self-hosted Roboto Mono woff2
│   ├── tests/fixtures/          # captured Beszel JSON for unit tests
│   ├── scripts/capture-fixtures.ts  # dumps real Beszel responses into fixtures/
│   ├── svelte.config.js         # adapter-node
│   └── vite.config.ts
├── deploy/
│   ├── docker-compose.yml       # prod: hub + agent + frontend + caddy
│   ├── docker-compose.override.yml  # dev: swaps frontend for Vite dev server
│   ├── Caddyfile                # cloudflare DNS-01, tailnet-IP-bound
│   ├── .env.example             # every variable the compose file expects
│   └── agent-install/
│       ├── linux-systemd.sh     # bserver / laptop / pi; amd64+arm64
│       └── windows-install.ps1  # Windows service
├── docs/
│   ├── decisions.md             # (existing)
│   ├── research/                # (existing)
│   ├── specs/                   # this spec, and future ones
│   └── plans/                   # implementation plan goes here
└── README.md                    # quickstart: clone, fill .env, compose up
```

Module boundaries (enforced by review, not tooling):

- `lib/beszel/` is the **only** module that imports `pocketbase`. Everywhere else consumes typed results. Absorbs schema churn in one place when the pinned Beszel version bumps.
- `lib/chart/` is the **only** module that imports `uplot`. Panels use a `<TimeSeries />` Svelte component that wraps it.
- `lib/design/` owns design tokens (CSS custom properties for surfaces, text, accent, focus-ring), `@font-face` declarations, and the `data-theme` store (system-preference default + manual override persisted to `localStorage`).
- Routes are thin: load data on the server, pass to panels. Panels are stateless except for their uPlot canvas.

---

## Design system

Verbatim from [AbstractNucleus/design](https://github.com/AbstractNucleus/design). Key constraints this imposes on the dashboard:

- **One typeface:** Roboto Mono, self-hosted woff2 in `static/fonts/`. No runtime Google Fonts.
- **Two surfaces** (`--bg`, `--sub-alt`), three text weights, one accent. No third surface tier, no gradients, no shadows (except the two-ring focus state), no emoji.
- **Numbers:** tabular figures, thin-space thousands (`128 430`), decimals only where they matter, no K/M/B suffixes.
- **Motion:** 125 ms `ease-out` default; number readouts tween over 400 ms with a spring; pulse states at 1.2 s `ease-in-out`. No bounces, no parallax.
- **Both themes supported** via `data-theme="dark"` / `data-theme="light"`. Default on first load follows `prefers-color-scheme`; manual toggle persists in `localStorage`.

Tokens, fonts, and theme palettes are copied into `lib/design/` as source of truth for this project — not imported from the upstream repo at build time. Update deliberately when upstream changes.

---

## Pages

### Fleet view (`/`)

One row per host:

| Col | Content |
| --- | ------- |
| status dot | green / amber / red / grey-unreachable |
| hostname | monospace, larger weight |
| OS + arch | `ubuntu 24.04 · amd64` |
| uptime | `14d 03h` |
| CPU sparkline | 60 min, tiny uPlot, load-avg overlay |
| mem % | tabular, thin-space thousands |
| disk % (root) | tabular |
| net in/out | bytes/sec, tabular |
| last-seen | relative, pulses amber if > 2× the agent's report interval |

Clicking a row navigates to `/hosts/[slug]`. No tags, no groups, no pin-favorites in Phase 1.

### Per-host detail (`/hosts/[slug]`)

One page, sections stacked vertically, in this order:

1. **Header.** Hostname, status, OS/arch/uptime, "last report" pulse.
2. **CPU.** `%` line chart + per-core heatmap (one row per core, 60 min of 1 s samples). Load-avg (1/5/15) readout. PSI (`some`, `full`) overlay when the kernel reports it.
3. **Memory.** Used vs. `MemAvailable` area chart. Swap used. Cache/buffers readout.
4. **Disk.** Per-mount table: %, IOPS read/write, queue depth, await latency. Small per-mount sparkline.
5. **Network.** Per-interface bandwidth in/out, packets/sec, errors/drops counters.
6. **Temps.** Sensor grid (CPU, GPU when present, NVMe). Pulses amber over threshold.
7. **Uptime + kernel.** Small footer row.

Shared **time-range toggle** in the layout header: 1 h / 24 h / 7 d / 30 d. Default 24 h. Lives in a layout-scoped Svelte store; every chart on the page subscribes.

~10 distinct panel components. Fleet sparkline is a trivial variant of the line chart.

---

## Beszel integration

`lib/beszel/` is a thin typed wrapper around the `pocketbase` JS SDK. Exported surface (not exhaustive):

```ts
export type HostSlug = string;                 // Beszel system ID / name

export interface SystemRow { /* typed mirror of Beszel's systems record */ }
export interface StatsSample { /* typed mirror of one stats sample */ }
export interface ContainerRow { /* typed mirror of containers table */ }

export function createClient(baseUrl: string, apiToken?: string): BeszelClient;

export interface BeszelClient {
  listSystems(): Promise<SystemRow[]>;
  getSystem(slug: HostSlug): Promise<SystemRow>;
  getRecentStats(slug: HostSlug, windowMs: number): Promise<StatsSample[]>;
  subscribeStats(slug: HostSlug, cb: (s: StatsSample) => void): Unsubscribe;
  subscribeFleet(cb: (updates: SystemRow[]) => void): Unsubscribe;
}
```

`StatsSample` is whatever Beszel's `system_stats` collection shape looks like at the pinned version — pinned in a `BESZEL_VERSION` env var and typed against the response shape we capture from a running hub during fixture capture.

SSR (SvelteKit `+page.server.ts`) fetches initial data via REST so the first paint is not blank. Client hydration then opens the realtime subscription. Beszel version is an env var (`BESZEL_VERSION`) used by compose; the JS wrapper has no version-coupled logic beyond typed models.

Auth: Beszel's PocketBase collections are configured to allow public reads from the frontend's internal IP. If that doesn't hold at implementation time, the frontend uses an API token stored in `BESZEL_API_TOKEN` (env var, never shipped to client).

---

## Deployment

One `deploy/docker-compose.yml`. Services:

- `beszel-hub` — `henrygd/beszel:${BESZEL_VERSION}`. Internal only, no published port. Volume: `hub-data`.
- `beszel-agent` — `henrygd/beszel-agent:${BESZEL_VERSION}`. `pid: host`, `network: host`. Mounts `/:/hostfs:ro` and `/var/run/docker.sock:ro`. Env: `HUB_URL=http://beszel-hub:8090`, `KEY=${BESZEL_AGENT_KEY}`.
- `frontend` — built from `../app` (multi-stage Dockerfile, `adapter-node`). Internal only. Env: `PUBLIC_BESZEL_URL` (internal compose URL), `BESZEL_API_TOKEN` (optional).
- `caddy` — `caddy:2` with `caddy-dns/cloudflare` plugin baked in. Ports `443:443` **bound to the tailnet IP only** via `TS_IP` env. Volumes `caddy-data`, `caddy-config`. Mounts `./Caddyfile`.

Caddyfile:

```
analytics.noelkleen.com {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    bind {env.TS_IP}
    reverse_proxy frontend:3000
}
```

Prereqs (documented in README):

- Cloudflare API token with `Zone:DNS:Edit` on the `noelkleen.com` zone.
- DNS A record `analytics.noelkleen.com → 100.x.y.z` (bserver tailnet IP), **gray cloud** (proxied mode off).
- Tailscale installed on bserver and on every client device that needs access.

Dev mode: `docker-compose.override.yml` replaces the `frontend` service with a Vite dev server that bind-mounts `app/` and listens on `http://localhost:5173`. Caddy is not used in dev. Agents and hub run the same way.

---

## Agent install

Two standalone scripts in `deploy/agent-install/`. Both are designed to be fetched directly from GitHub and piped to a shell — no repo clone on agent hosts.

### `linux-systemd.sh` (bserver / laptop / Pi)

One-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/<user>/analytics/main/deploy/agent-install/linux-systemd.sh \
  | sudo bash -s -- --hub=tcp://<tailnet-ip>:45876 --key=<pubkey>
```

Behavior:

1. Parse `--hub` and `--key` args (required).
2. Detect CPU arch: `uname -m` → `amd64` / `arm64`.
3. Download the matching `beszel-agent` binary from the pinned Beszel GitHub release (version embedded in the script).
4. Install to `/usr/local/bin/beszel-agent`, mode 755.
5. Write `/etc/systemd/system/beszel-agent.service` with the args baked in.
6. `systemctl daemon-reload`, `systemctl enable --now beszel-agent`.
7. Print confirmation + `systemctl status beszel-agent` pointer.

Works on Ubuntu (bserver), Arch (laptop), and Raspberry Pi OS (pi) without modification.

### `windows-install.ps1` (desktop)

One-liner:

```powershell
iwr -useb https://raw.githubusercontent.com/<user>/analytics/main/deploy/agent-install/windows-install.ps1 `
  | iex -ArgumentList "--hub=tcp://<tailnet-ip>:45876","--key=<pubkey>"
```

Behavior:

1. Parse `--hub` and `--key` args.
2. Download Windows binary from the pinned Beszel release.
3. Install to `C:\Program Files\Beszel\beszel-agent.exe`.
4. Register as a Windows service (per Beszel's official instructions at the pin version — `sc.exe` or NSSM).
5. Start the service.

Both scripts pin to a single Beszel version inside the script; bumping Beszel means bumping the scripts and re-running `curl | bash` on each host.

After running the script, the host must be registered in Beszel's admin UI (one-time, paste the agent's public key).

---

## Testing

**Automated (Vitest, runs locally via `pnpm test`):**

- `lib/format/*.test.ts` — tabular numbers, thin-space thousands, byte-rate rounding, relative time.
- `lib/beszel/*.test.ts` — response parsing against fixtures in `app/tests/fixtures/`. Fixtures captured by `scripts/capture-fixtures.ts` hitting a local dev-mode Beszel and dumping: one `systems` list, one `system_stats` page, one `containers` list, one realtime event envelope.
- `lib/chart/*.test.ts` — tweened-number utility, time-range math. Not the uPlot canvas itself.
- Panel components — render against fixtures; assert DOM contains expected readouts and that the uPlot constructor was called with the expected data shape (mock via `vi.mock`).

**Not in scope:** Playwright, CI (no GitHub Actions this cycle — decisions.md defers it).

**Manual verification** — the real "done" checklist, also the feature's acceptance criteria:

1. `cd deploy && docker compose up -d` on bserver → all four services report healthy within 60 s.
2. `analytics.noelkleen.com` resolves to bserver's tailnet IP; Caddy issues a TLS cert via Cloudflare DNS-01 on first start.
3. From an on-tailnet browser: dashboard loads over HTTPS. From off-tailnet: connection refused / times out.
4. Fleet view shows bserver after agent registration; row live-updates (sparkline moves, last-seen counter ticks) at ~1 Hz.
5. Clicking bserver → per-host page renders CPU / mem / disk / net / temps panels with data moving at ~1 Hz.
6. `linux-systemd.sh` one-liner runs clean on laptop (Arch, amd64) and Pi (ARM); `windows-install.ps1` runs clean on desktop. After registering each in the Beszel admin UI, the host appears in the fleet view within 60 s.
7. Theme toggle flips `data-theme`; reload respects the persisted choice; first load on a fresh profile honors `prefers-color-scheme`.
8. Time-range toggle on per-host page updates all charts on the page simultaneously.

---

## Acceptance criteria (summary)

The feature is shipped when:

- All code PRs are merged to `main`.
- The README quickstart, followed by a user with zero prior context, produces the verified state above (items 1–8 under Manual verification).
- The test suite (`pnpm -C app test`) passes locally.
- The repo contains no orphaned scaffolding (unused routes, dead exports, half-wired panels).

Deployment itself (running the compose stack on bserver, running the agent install scripts on the other three hosts, registering each in the admin UI) happens manually after merge — it is not part of any PR's CI.

---

## Open implementation details

These do not block the plan; the planner and implementers resolve them inline:

- **Beszel version to pin.** Latest stable tag as of implementation start. Captured in `BESZEL_VERSION` in `.env.example`.
- **Agent-registration UX.** Beszel currently requires manual public-key paste into the admin UI. Keep that flow; don't automate it.
- **`adapter-node` confirmation.** Assumed correct; verify at scaffold time.
- **Container metrics.** Beszel collects Docker container stats on bserver. MVP shows them on the per-host page if present, below Disk. If the table becomes awkward, defer to Phase 2.

---

## Reference

- [docs/decisions.md](../decisions.md) — architectural commitments.
- [docs/research/](../research/) — the five background research documents.
- [AbstractNucleus/design](https://github.com/AbstractNucleus/design) — design system source.
- [Beszel](https://github.com/henrygd/beszel) — upstream hub + agents.
- [uPlot](https://github.com/leeoniya/uPlot) — chart library.
