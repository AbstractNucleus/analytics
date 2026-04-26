# Decision — nginx on aserver replaces Caddy on bserver

**Date:** 2026-04-26
**Status:** Approved; implementation in PR `feat/phase-2-nginx-ingress` (single greenfield PR — Phase 1 was never deployed live, so the spec's two-PR + cutover sequencing collapses to one end-state PR).
**Related:** [docs/specs/2026-04-26-nginx-ingress-design.md](../specs/2026-04-26-nginx-ingress-design.md), [supabase-server architecture.md](https://github.com/AbstractNucleus/supabase-server/blob/main/docs/architecture.md).

## Decision

Retire the Caddy reverse proxy that ships with the Phase 1 analytics stack. Replace it with an nginx vhost on `aserver` (the home lab's existing public-facing edge), bound to aserver's tailnet IP, terminating TLS via the certbot + Cloudflare DNS-01 machinery already in use for `studio.noelkleen.com`.

After the deploy:

- `analytics.noelkleen.com` resolves to aserver's tailnet IP.
- TLS terminates on aserver via Let's Encrypt.
- aserver's nginx reverse-proxies over the LAN to `<bserver-lan-ip>:<ANALYTICS_HOST_PORT>`.
- This repo no longer contains `deploy/Caddyfile`, `deploy/caddy/`, the `caddy:` compose service, the `caddy-data` / `caddy-config` volumes, or the `CLOUDFLARE_API_TOKEN` / `TS_IP` env vars.

## Why

Phase 1 designed Caddy on bserver. It works on paper. But aserver already runs nginx as the public-facing edge for the supabase-server stack, and Studio (`studio.noelkleen.com`) uses the same DNS-01 + Let's Encrypt machinery. Running two reverse proxies for the same shape of work — tailnet-only TLS, reverse-proxy to a container on bserver — costs more than it earns:

- Two cert renewal mechanisms, two failure modes.
- Two places to add the next tailnet-only home service.
- An xcaddy build stage in this repo (`deploy/caddy/Dockerfile`) maintained only to embed the Cloudflare DNS-01 plugin into the Caddy binary — pure incidental complexity.
- A second deployment of the Cloudflare API token, separate from the one already on aserver.

Consolidating on nginx-on-aserver gives one ingress story for the home lab, parallels the proven supabase-server pattern, and removes a build stage from this repo.

## Why one PR instead of two

The spec and plan describe a two-PR sequence (additive then subtractive) bracketing an operational cutover, designed to keep Caddy alive as a hot-rollback target during a live migration. Since Phase 1 was never actually deployed on bserver, there is no live system to migrate from — the deploy is greenfield. The two-PR sequence collapses to a single end-state PR; the operational steps remain (LE cert, nginx vhost, DNS, verification) but with no rollback target needed.

## Rejected alternatives

- **Keep Caddy on bserver.** Works, but doubles ingress operational surface and keeps the xcaddy build stage in this repo. Explicitly rejected by the user 2026-04-26.
- **Run Caddy on aserver instead of nginx.** Would consolidate to one reverse proxy but require introducing Caddy to a host that already runs nginx with working certbot timers. Net loser vs. extending nginx.
- **Bind the frontend to `0.0.0.0:<ANALYTICS_HOST_PORT>` on bserver.** Wider attack surface than necessary — anyone on bserver's LAN could hit the dashboard directly, bypassing nginx's TLS. Binding to `<BSERVER_LAN_IP>` mirrors the supabase-server pattern and limits exposure to the LAN interface only.
- **Tailscale Funnel / `tailscale serve`.** Avoids nginx entirely but couples ingress to Tailscale's daemon and gives up the existing certbot machinery. Out of step with the established pattern.

## Next

- Merge this PR.
- Operational deploy: clone repo on bserver, configure `.env`, `docker compose up -d`. On aserver: `certbot certonly --dns-cloudflare`, drop the analytics vhost, reload nginx. In Cloudflare: A record for `analytics.noelkleen.com` → aserver tailnet IP, gray cloud.
- Follow-up Phase 2 specs: Beszel SQLite backups (B), deploy annotations (D), longer-term retention (F).
