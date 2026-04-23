# Analytics dashboard — decisions

Decisions landed during the brainstorming session on 2026-04-23, informed by `docs/research/`. These are the commitments that unblock implementation.

---

## Context

Self-hosted analytics panel for a personal fleet of four machines:

| Host | OS | Role |
| ---- | -- | ---- |
| `bserver` | Ubuntu 24.04 LTS | Hub + first agent |
| Home desktop | Windows | Agent |
| Laptop | Linux | Agent |
| Raspberry Pi | Linux (ARM) | Agent |

Target URL: `analytics.noelkleen.com`. Access restricted to the Tailscale tailnet. Single user.

---

## Decisions

### 1. Architecture — hybrid: Beszel backend, custom frontend

Run Beszel's hub and agents unchanged as the data plane. Build a standalone SvelteKit frontend that reads Beszel's REST API and subscribes to PocketBase's native SSE realtime stream.

**Why:** Beszel's collector coverage (CPU, disk, docker, gpu, smart, zfs, sensors) and push-over-WebSocket transport are battle-tested — rebuilding that would cost weeks. But Beszel's default React + Recharts + Tailwind UI would cost more to retrofit to this project's editorial design system than it saves. A separate frontend gives a clean canvas without throwing away the hard parts.

**Alternatives rejected:**

- **Fork Beszel and reskin over time.** Research's top recommendation, but the gradual-reskin phase leaves a half-styled UI running for months, and the design system is strict enough that "gradual" is unrealistic.
- **Build fully from scratch.** Full control but several weeks of collector rebuild for no net gain.

**Caveat:** Beszel docs warn the API shape may change in minor releases. Pin a specific Beszel version in `docker-compose.yml` and update deliberately.

### 2. Frontend framework — SvelteKit

**Why:** Smallest bundle size (material for a chart-heavy dashboard), no VDOM overhead on streaming updates, straightforward integration with PocketBase's JS SDK, and a "less magic" feel that suits the editorial design system.

**Alternatives rejected:** Next.js (heavier, overkill for a single-user dashboard); Astro (static-first model fights a mostly-live UI).

### 3. Design system — AbstractNucleus editorial (Roboto Mono, bone paper, rust accent)

Follow [github.com/AbstractNucleus/design](https://github.com/AbstractNucleus/design) verbatim. This supersedes the three style directions proposed in the UI patterns research document — the user already has a committed design language.

Key constraints this imposes on the dashboard:

- One typeface: **Roboto Mono**, self-hosted (no runtime Google Fonts).
- Two surfaces (`bg` + `sub-alt`), three text weights, one accent. No third surface tier, no gradients, no shadows (except the two-ring focus), no emoji.
- Numbers: tabular figures, thin-space thousands (`128 430`), decimals where they matter, no K/M/B suffixes.
- Motion: 125ms `ease-out` default; number readouts tween over 400ms with a spring; pulse states at 1.2s `ease-in-out`. No bounces, no parallax.
- Both light ("case_light") and dark ("case_dark") themes supported via `data-theme="dark"`.

### 4. Charts — uPlot

**Why:** ~50 KB, MIT-licensed, ~10× faster than Recharts on streaming time series. No React dependency (works natively in Svelte with a thin wrapper). Non-negotiable for a live dashboard at per-second fidelity.

**Alternatives rejected:** Recharts (too slow on streaming), Chart.js (heavier, less precise for time series), D3 (too much custom work for standard panels).

### 5. Host OS and deployment — Ubuntu 24.04 + Docker Compose

All services on bserver in one `docker-compose.yml`:

```
services:
  beszel-hub        # pinned version, internal port only
  beszel-agent      # bserver's own agent
  frontend          # SvelteKit (Node adapter)
  caddy             # TLS termination, reverse proxy
```

One `docker compose up -d` brings the stack. Volumes for Beszel's SQLite and Caddy's cert store. Portable to a second machine later if needed.

**Alternatives rejected:** Native systemd units for Beszel (more moving parts, harder to reproduce); Kubernetes (comically overkill for four machines).

### 6. Access control — Tailscale tailnet only, no app-level auth

The dashboard, Beszel admin UI, and Beszel API are all reachable only from the user's Tailscale tailnet. No passwords, no passkeys, no TOTP on the app itself.

**Why:** The metrics dashboard leaks fingerprinting data (hostnames, process names, resource curves) that has no reason to be public. Everything-on-tailnet eliminates a whole class of auth concerns for a personal single-user product. Auth can be revisited later if the user ever needs to share access.

**Admin surface:** Beszel's PocketBase admin UI stays bound to an internal-only port. Rarely needed after initial setup.

### 7. DNS and TLS — Cloudflare DNS-01 via Caddy

`analytics.noelkleen.com` DNS lives on Cloudflare. The `A` record points to bserver's tailnet IP (`100.x.y.z`) with **orange cloud OFF** (DNS only, not proxied). Caddy uses the Cloudflare DNS-01 ACME challenge to acquire and renew certificates — this works even though bserver isn't publicly reachable.

**Requirements:**

- Cloudflare API token scoped to `Zone:DNS:Edit` on the `noelkleen.com` zone, supplied to Caddy via env var.
- Caddy image with the `caddy-dns/cloudflare` plugin baked in (build stage or pre-built variant).
- A record must remain **gray cloud** — proxied mode breaks tailnet routing.

**Known tradeoff:** the tailnet IP is technically visible in public DNS lookups. It is not usable without also being on the tailnet. Acceptable for this use case.

**Alternative rejected:** Tailscale MagicDNS with `bserver.<tailnet>.ts.net` URL (simpler, no DNS config, but loses the custom domain).

### 8. Fleet — four machines, heterogeneous

Agents to install:

- bserver (Ubuntu) — hub + first agent
- Laptop (Linux)
- Raspberry Pi (Linux ARM)
- Home desktop (Windows)

Beszel ships official agents for all of these, including Windows and ARM. The fleet view must handle mixed OS from the first multi-host milestone (not a Linux-only assumption).

### 9. Repo layout — monorepo

Everything in this existing `analytics` repo:

```
analytics/
├── app/                    # SvelteKit frontend
├── deploy/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── agent-install/      # one-liner scripts for Linux/Windows
├── docs/
│   ├── decisions.md        # this file
│   └── research/           # background research
└── README.md
```

Beszel is a pinned Docker image dependency, not vendored, not forked.

---

## Deferred

### Alerting channel

No decision yet on whether to use ntfy, Telegram, email, or a chat webhook. The user is not sure notifications are needed. Revisit when threshold alerts and a dead-man switch actually get built.

---

## Open questions for implementation

These don't block starting implementation, but need answers as the work progresses:

- **Beszel version to pin.** Check latest stable before writing the Compose file.
- **SvelteKit adapter.** `adapter-node` is the default assumption for Docker deployment; confirm at scaffold time.
- **PocketBase JS SDK vs. raw fetch.** SDK is more ergonomic for realtime subscriptions; confirm it supports Beszel's collection shape.
- **Backup strategy for Beszel's SQLite.** Initial deployment ships without backups; decide a target (litestream to S3? periodic rsync?) before the dashboard has meaningful history worth keeping.
- **Light vs. dark as default.** Design system supports both; default theme for this project TBD at first layout pass.

---

## Reference

See [docs/research/README.md](research/README.md) for the full research bundle that informed these decisions, including a suggested phased roadmap.
