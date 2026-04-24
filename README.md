# analytics

Self-hosted, tailnet-only fleet monitoring for four machines (`bserver`, `coco`,
`kleen-pc`, `ZacBookPro`). Beszel collects per-host metrics; a custom SvelteKit
frontend styled per the AbstractNucleus design system presents them. Accessible
only over the user's Tailscale tailnet via `https://analytics.noelkleen.com`.

## Architecture

```
 Tailnet client
       │ https://analytics.noelkleen.com
       ▼
 ┌──────────────────────────── bserver (Tailscale) ────────────────────────────┐
 │                                                                             │
 │   Caddy :443  (TLS via Cloudflare DNS-01, bound to TS_IP only)              │
 │      │                                                                      │
 │      ▼                                                                      │
 │   SvelteKit frontend (adapter-node)                                         │
 │      │                                                                      │
 │      ▼                                                                      │
 │   Beszel hub :8090  ◄──── local beszel-agent (host pid/network)             │
 │      ▲                                                                      │
 └──────┼──────────────────────────────────────────────────────────────────────┘
        │ WebSocket push over the tailnet
        │
        ├─── beszel-agent on coco       (Linux, systemd)
        ├─── beszel-agent on kleen-pc   (Windows, service)
        └─── beszel-agent on ZacBookPro (Windows, service)
```

- Caddy terminates TLS and reverse-proxies to the SvelteKit frontend. It binds
  to bserver's Tailscale IP, so the stack is unreachable over WAN even if DNS
  leaks.
- The frontend talks to the Beszel hub (PocketBase) over the compose network
  for initial loads and realtime subscriptions.
- The hub sits on an internal docker network only. Agents reach it over the
  tailnet; the frontend reaches it over the compose network.

## Prereqs

- **Tailscale** installed on bserver and on every agent host (and on every
  client device that needs to view the dashboard).
- **Cloudflare account** with an API token scoped to `Zone.DNS:Edit` on the
  `noelkleen.com` zone.
- **DNS A record** `analytics.noelkleen.com` -> `<bserver Tailscale IP>`,
  **gray cloud** (DNS-only, proxied mode off — Cloudflare proxying breaks
  tailnet routing).
- **Docker Engine + Compose v2** on bserver.
- **Agent hosts** (coco, kleen-pc, ZacBookPro) need only a shell — no Docker.

## First-time setup on bserver

```sh
git clone https://github.com/AbstractNucleus/analytics.git
cd analytics/deploy
cp .env.example .env
```

Open `.env` and fill in:

- `BESZEL_VERSION` — already pinned to `0.18.7`; leave as-is unless you know
  why you're changing it.
- `CLOUDFLARE_API_TOKEN` — the token from the prereqs.
- `TS_IP` — bserver's Tailscale IPv4 (`tailscale ip -4`).
- `PUBLIC_BESZEL_URL` — leave as `http://beszel-hub:8090` for compose-internal
  use.
- `BESZEL_AGENT_KEY` and `BESZEL_API_TOKEN` — leave **blank** for now; you fill
  them after the hub is up. See the note below.

Bring the stack up:

```sh
docker compose -f docker-compose.yml up -d
```

**Two-pass bootstrap gotcha.** The Beszel hub generates the agent-registration
public key on first boot, and you cannot know the key ahead of time. So:

1. First `up` brings the hub, frontend, and Caddy online. The local
   `beszel-agent` service will restart-loop until you register it (harmless).
2. Follow the "Register the bserver agent" section below to grab the public
   key from the hub admin UI.
3. Paste the key into `.env` as `BESZEL_AGENT_KEY`, then
   `docker compose -f docker-compose.yml up -d beszel-agent` to pick up the
   new environment.
4. (Optional) Create a server-side API token in the PocketBase admin UI and
   paste it into `.env` as `BESZEL_API_TOKEN`, then `up -d frontend`.

## Register the bserver agent

The hub admin UI is served by PocketBase at `:8090`.

1. From bserver (before TLS is up, or any time if you want a direct view):
   `http://<TS_IP>:8090/_/` — or from any tailnet client once Caddy is up:
   `https://analytics.noelkleen.com/_/`.
2. Settings -> Systems -> **Add System**.
3. Enter hostname `bserver`, the system's Tailscale IP, and port `45876`
   (Beszel's default agent-hub port).
4. Beszel generates a public key. Copy it.
5. Paste it into `deploy/.env` as `BESZEL_AGENT_KEY`.
6. `docker compose -f docker-compose.yml up -d beszel-agent` to restart the
   local agent with the new key.

Within ~60s, the bserver row appears on the fleet view.

## Install agents on coco, kleen-pc, ZacBookPro

For each additional agent host, first add the system in the hub admin UI
(Settings -> Systems -> Add System) to generate that host's public key, then
run the installer one-liner on the host itself.

### Linux (coco)

```sh
curl -fsSL https://raw.githubusercontent.com/AbstractNucleus/analytics/main/deploy/agent-install/linux-systemd.sh \
  | sudo bash -s -- --hub=tcp://<bserver-TS-IP>:45876 --key=<agent-public-key>
```

The script pins Beszel to the same version as the compose stack, auto-detects
`amd64` vs `arm64`, installs the binary to `/usr/local/bin/beszel-agent`, and
registers a systemd unit. Works on Ubuntu, Arch, and Raspberry Pi OS.

### Windows (kleen-pc, ZacBookPro)

From an **elevated** PowerShell:

```powershell
iwr -useb https://raw.githubusercontent.com/AbstractNucleus/analytics/main/deploy/agent-install/windows-install.ps1 -OutFile C:\install-beszel.ps1
C:\install-beszel.ps1 -Hub tcp://<bserver-TS-IP>:45876 -Key <agent-public-key>
```

The script downloads the pinned Windows release, installs to
`C:\Program Files\Beszel\beszel-agent.exe`, registers a Windows service named
`beszel-agent` with `HUB_URL` and `KEY` in its environment, and starts it.

## Dev mode

Dev mode swaps the built frontend image for a Vite dev server with `../app`
bind-mounted for hot reload. Caddy is not used in dev.

```sh
cd deploy
cp .env.example .env
# Minimal dev values: BESZEL_VERSION + any non-empty BESZEL_AGENT_KEY are enough
# to start the hub + agent. CLOUDFLARE_API_TOKEN and TS_IP are unused in dev.
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d beszel-hub frontend
```

Visit `http://localhost:5173`.

## What you'll see

Once at least one agent is registered:

- **Fleet view (`/`)** — one row per host: status dot, hostname, OS + arch,
  uptime, CPU sparkline, memory %, disk %, net in/out, last-seen (pulses
  amber if the host hasn't reported within ~2x its interval). Rows
  live-update at ~1 Hz. Click a row to drill in.
- **Per-host page (`/hosts/[slug]`)** — CPU (% line chart + per-core heatmap
  + load-avg + PSI when available), memory (used vs. `MemAvailable` area +
  swap + cache/buffers), disk (per-mount %, IOPS, queue depth, latency),
  network (per-interface bandwidth, packets/s, errors/drops), temps (CPU /
  GPU / NVMe sensor grid, pulses amber over threshold), uptime/kernel
  footer. All charts on the page share a **time-range toggle** (1 h / 24 h /
  7 d / 30 d) in the layout header — switching it re-requests data for
  every chart simultaneously.
- **Theme toggle** — flips `data-theme` between `light` and `dark`; the
  choice persists in `localStorage`. First load on a fresh profile follows
  `prefers-color-scheme`.

## Running tests

The SvelteKit app uses Vitest. At Phase 1 MVP completion the suite is
**139 tests across 22 files**.

```sh
pnpm -C app install        # install deps (Corepack will activate pnpm@10.33.2)
pnpm -C app test           # run vitest once
pnpm -C app test:watch     # watch mode
pnpm -C app check          # svelte-check type check
pnpm -C app build          # produces app/build/ via adapter-node
```

## Cross-links

- [docs/decisions.md](docs/decisions.md) — architectural decision log.
- [docs/research/README.md](docs/research/README.md) — index of the five
  deep-dive analytics-panel research docs.
- [docs/specs/2026-04-23-phase-1-mvp-design.md](docs/specs/2026-04-23-phase-1-mvp-design.md)
  — Phase 1 MVP design spec.
- [docs/plans/2026-04-23-phase-1-mvp-plan.md](docs/plans/2026-04-23-phase-1-mvp-plan.md)
  — Phase 1 implementation plan (narrative).
- [docs/plans/2026-04-23-phase-1-mvp-concerns.json](docs/plans/2026-04-23-phase-1-mvp-concerns.json)
  — concern decomposition used to parallelize the build.
- [docs/patterns/tailnet-https-via-cloudflare.md](docs/patterns/tailnet-https-via-cloudflare.md)
  — the Caddy + Cloudflare DNS-01 + gray-cloud pattern that makes
  `https://analytics.noelkleen.com` resolve only over the tailnet.
