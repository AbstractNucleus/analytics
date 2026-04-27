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
 ┌────────────────── aserver (Tailscale + LAN) ─────────────────┐
 │  nginx :443  bound to <aserver-tailnet-ip>                   │
 │     │  TLS via Let's Encrypt (Cloudflare DNS-01)             │
 │     └─► <bserver-lan-ip>:${ANALYTICS_HOST_PORT}              │
 └─────────────────────────┬────────────────────────────────────┘
                           │ LAN (192.168.x.x)
                           ▼
 ┌────────────────── bserver (Docker) ──────────────────────────┐
 │  SvelteKit frontend (adapter-node)                           │
 │     ports: ${BSERVER_LAN_IP}:${ANALYTICS_HOST_PORT}:3000     │
 │     │                                                        │
 │     ▼                                                        │
 │  Beszel hub :8090 (PocketBase) ◄── local beszel-agent        │
 │     ▲                                                        │
 └─────┼────────────────────────────────────────────────────────┘
       │ WebSocket push over the tailnet
       │
       ├─── beszel-agent on coco       (Linux, systemd)
       ├─── beszel-agent on kleen-pc   (Windows, service)
       └─── beszel-agent on ZacBookPro (Windows, service)
```

- nginx on aserver terminates TLS and reverse-proxies over the LAN to the
  SvelteKit frontend on bserver. It binds to aserver's Tailscale IP, so the
  stack is unreachable over WAN even if DNS leaks.
- The frontend talks to the Beszel hub (PocketBase) over the compose network
  for initial loads and realtime subscriptions.
- The hub sits on an internal docker network only. Agents reach it over the
  tailnet; the frontend reaches it over the compose network.

## Prereqs

- **Tailscale** installed on bserver and on every agent host (and on every
  client device that needs to view the dashboard).
- **aserver** already runs nginx + certbot with the Cloudflare DNS-01 plugin
  (from the supabase-server stack). The same machinery handles
  `analytics.noelkleen.com`.
- **DNS A record** `analytics.noelkleen.com` -> aserver's Tailscale IP,
  **gray cloud** (DNS-only, proxied mode off — Cloudflare proxying breaks
  tailnet routing).
- **Docker Engine + Compose v2** on bserver.
- **Agent hosts** (coco, kleen-pc, ZacBookPro) need only a shell — no Docker.

## First-time setup

### On bserver

```sh
git clone https://github.com/AbstractNucleus/analytics.git ~/repos/analytics
cd ~/repos/analytics/deploy
cp .env.example .env
```

Open `.env` and fill in:

- `BESZEL_VERSION` — already pinned to `0.18.7`; leave as-is unless you know why.
- `BSERVER_LAN_IP` — bserver's LAN IPv4 (`ip -4 -br addr show | grep -v lo`).
- `BSERVER_TS_IP` — bserver's Tailscale IPv4 (`tailscale ip -4` on bserver).
- `ANALYTICS_HOST_PORT` — leave at `3001` unless port 3001 is taken on bserver.
- `BESZEL_AGENT_KEY` — leave **blank** for now; filled after the hub is up.
- `BESZEL_API_TOKEN` — leave blank for the first `up`; **required** before the
  dashboard can show any data. The SSR loader uses this token to read the
  `systems` and `system_stats` collections (which require auth via the
  collection rules). Generation steps below.
- `PUBLIC_BESZEL_URL` — leave as `http://beszel-hub:8090`.

Bring the stack up:

```sh
docker compose -f docker-compose.yml up -d
```

The frontend now listens at `<BSERVER_LAN_IP>:<ANALYTICS_HOST_PORT>` over the LAN. Nothing is reachable from outside the LAN yet — aserver does the TLS / DNS work.

### On aserver

aserver already runs nginx (host install) and has certbot + the Cloudflare DNS-01 plugin from the supabase-server stack. Reuse that machinery:

```sh
sudo certbot certonly --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    -d analytics.noelkleen.com

# Copy the vhost snippet from the bserver clone (or scp it across):
scp bserver:~/repos/analytics/deploy/nginx/snippets/analytics.conf.example /tmp/
sudo install -o root -g root -m 644 /tmp/analytics.conf.example \
    /etc/nginx/sites-available/analytics.conf
sudoedit /etc/nginx/sites-available/analytics.conf
# Replace: <your-domain>, <bserver-lan-ip>, <analytics-host-port>, <aserver-tailnet-ip>

sudo ln -s /etc/nginx/sites-available/analytics.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### In Cloudflare

Set the `analytics.noelkleen.com` A record:

- **Value:** aserver's tailnet IP (`tailscale ip -4` on aserver).
- **Proxy:** DNS only (gray cloud — orange-clouded breaks tailnet routing).

### Verify

From any tailnet client:

```sh
curl -sI https://analytics.noelkleen.com/
# Expect: HTTP/2 200, server: nginx/...
```

Open `https://analytics.noelkleen.com/` in a browser. The "Two-pass bootstrap" section below covers registering the bserver agent.

## Two-pass bootstrap

**Two-pass bootstrap gotcha.** The Beszel hub generates the agent-registration
public key on first boot, and you cannot know the key ahead of time. So:

1. First `up` brings the hub, frontend online. The local
   `beszel-agent` service will restart-loop until you register it (harmless).
2. Follow the "Register the bserver agent" section below to grab the public
   key from the hub admin UI.
3. Paste the key into `.env` as `BESZEL_AGENT_KEY`, then
   `docker compose -f docker-compose.yml up -d beszel-agent` to pick up the
   new environment.
4. **Required to unblank the dashboard.** The systems collection's listRule
   requires authentication, so the SSR loader returns nothing until the
   `BESZEL_API_TOKEN` env var is set. Generate a long-lived token by
   impersonating the Beszel admin user, then `up -d frontend`:

   ```sh
   # Replace email + password with the Beszel admin user's credentials
   # (created automatically the first time you load the bundled UI, OR via the
   #  superuser API; see "Register the bserver agent" below for both flows).
   SU_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
     -d '{"identity":"<superuser-email>","password":"<superuser-password>"}' \
     http://<BSERVER_TS_IP>:8090/api/collections/_superusers/auth-with-password \
     | jq -r .token)
   ADMIN_ID=$(curl -s -H "Authorization: $SU_TOKEN" \
     "http://<BSERVER_TS_IP>:8090/api/collections/users/records?filter=role%3D%22admin%22" \
     | jq -r '.items[0].id')
   curl -s -X POST -H "Authorization: $SU_TOKEN" -H "Content-Type: application/json" \
     -d '{"duration":31536000}' \
     "http://<BSERVER_TS_IP>:8090/api/collections/users/impersonate/$ADMIN_ID" \
     | jq -r .token
   # Paste the printed JWT into .env as BESZEL_API_TOKEN, then up -d frontend.
   ```

## Register the bserver agent

Two distinct admin surfaces are served on bserver port 8090:

- **PocketBase admin** (`/_/`) — generic database editor for the underlying
  collections. Reachable via the public URL: `https://analytics.<your-domain>/_/`.
  Sign in with the superuser created via `beszel superuser upsert <email> <pw>`
  on the hub container. Use this for low-level maintenance, not for adding
  systems (the schema requires a `users` row + a `fingerprints` row that the
  bundled UI generates atomically; raw record creation here won't produce a
  usable agent key).
- **Beszel bundled admin** (`/`) — the upstream Beszel UI with the
  Settings -> Systems -> Add System flow. We replaced the root path on the
  public URL with our custom dashboard, so this UI is only exposed on the
  tailnet at `http://<BSERVER_TS_IP>:8090/`. **This is the URL you use to
  register agents.**

To register `bserver`:

1. From any tailnet client, open `http://<BSERVER_TS_IP>:8090/`.
2. Sign in (same superuser as above; the bundled UI shares PocketBase's auth).
3. Settings -> Systems -> **Add System**.
4. Enter hostname `bserver`, host `<bserver-Tailscale-IP>`, port `45876`
   (Beszel's default agent-hub port).
5. Beszel generates a public key. Copy it.
6. Paste it into `deploy/.env` as `BESZEL_AGENT_KEY`.
7. `docker compose -f docker-compose.yml up -d beszel-agent` to restart the
   local agent with the new key.

Within ~60s, the bserver row appears on the fleet view.

## Install agents on coco, kleen-pc, ZacBookPro

> **Only the three non-hub hosts.** bserver already runs `beszel-agent` as a
> container (see the compose file) with `pid: host` + `network_mode: host`, so
> it self-reports without the installer scripts. Running the Linux one-liner on
> bserver on top of the compose agent would produce two agents reporting the
> same metrics under different keys. Leave bserver's compose agent alone; use
> the scripts below only on coco, kleen-pc, and ZacBookPro.

Two registration modes are supported. Pick one and use it consistently across
all your agent hosts:

#### Mode A: universal token (recommended for fleets that grow over time)

Generate one token in Beszel's bundled UI at `http://<BSERVER_TS_IP>:8090/`
under **Settings -> Tokens & Fingerprints -> Universal token** (toggle "Active"
and "Permanent" if you want it to keep working after the first registration).
The same token works for every host; the agent self-registers on first connect,
so there is no per-host Add-System click. The hub URL changes from
`tcp://<host>:45876` (legacy SSH path) to `http://<host>:8090` (the WebSocket
path the agent uses with a token).

> **Tradeoff.** Universal tokens are bearer credentials — anyone holding the
> token can register a system under your account. Rotate it (same UI screen)
> after onboarding a new host on a less-trusted machine, or stick with Mode B
> below if that's a concern.

#### Mode B: per-system key (one Add-System click per host)

Add the system in Beszel's bundled admin UI at `http://<BSERVER_TS_IP>:8090/`
(Settings -> Systems -> Add System) to generate that host's public key, then
run the installer one-liner with the `--key=` / `-Key` flag on the host itself.
Each key is bound to one specific host.

### Linux (coco)

Universal-token mode:

```sh
curl -fsSL https://raw.githubusercontent.com/AbstractNucleus/analytics/main/deploy/agent-install/linux-systemd.sh \
  | sudo bash -s -- --hub=http://<bserver-TS-IP>:8090 --token=<universal-token>
```

Per-system-key mode:

```sh
curl -fsSL https://raw.githubusercontent.com/AbstractNucleus/analytics/main/deploy/agent-install/linux-systemd.sh \
  | sudo bash -s -- --hub=tcp://<bserver-TS-IP>:45876 --key=<agent-public-key>
```

The script pins Beszel to the same version as the compose stack, auto-detects
`amd64` vs `arm64`, installs the binary to `/usr/local/bin/beszel-agent`, and
registers a systemd unit. Works on Ubuntu, Arch, and Raspberry Pi OS.

### Windows (kleen-pc, ZacBookPro)

From an **elevated** PowerShell. Universal-token mode:

```powershell
iwr -useb https://raw.githubusercontent.com/AbstractNucleus/analytics/main/deploy/agent-install/windows-install.ps1 -OutFile C:\install-beszel.ps1
C:\install-beszel.ps1 -Hub http://<bserver-TS-IP>:8090 -Token <universal-token>
```

Per-system-key mode:

```powershell
iwr -useb https://raw.githubusercontent.com/AbstractNucleus/analytics/main/deploy/agent-install/windows-install.ps1 -OutFile C:\install-beszel.ps1
C:\install-beszel.ps1 -Hub tcp://<bserver-TS-IP>:45876 -Key <agent-public-key>
```

The script downloads the pinned Windows release, installs to
`C:\Program Files\Beszel\beszel-agent.exe`, registers a Windows service named
`beszel-agent` with `HUB_URL` plus the chosen `KEY` and/or `TOKEN` in its
environment, and starts it.

## Dev mode

Dev mode swaps the built frontend image for a Vite dev server with `../app`
bind-mounted for hot reload.

```sh
cd deploy
cp .env.example .env
# Minimal dev values: BESZEL_VERSION + any non-empty BESZEL_AGENT_KEY are enough
# to start the hub + agent. BSERVER_LAN_IP and ANALYTICS_HOST_PORT are unused in dev.
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
- [docs/specs/2026-04-26-nginx-ingress-design.md](docs/specs/2026-04-26-nginx-ingress-design.md)
  — Phase 2 ingress re-architecture spec.
- [docs/decisions/2026-04-26-nginx-ingress.md](docs/decisions/2026-04-26-nginx-ingress.md)
  — decision record for nginx-on-aserver.
- [docs/plans/2026-04-26-nginx-ingress-plan.md](docs/plans/2026-04-26-nginx-ingress-plan.md)
  — Phase 2 implementation plan (the file changes you're reading the result of).
