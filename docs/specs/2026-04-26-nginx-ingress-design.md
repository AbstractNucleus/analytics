# Phase 2 — nginx ingress re-architecture

Status: approved 2026-04-26.

Supersedes: the Caddy-on-bserver ingress described in [2026-04-23-phase-1-mvp-design.md](./2026-04-23-phase-1-mvp-design.md) §Architecture and the [tailnet-https-via-cloudflare](../patterns/tailnet-https-via-cloudflare.md) pattern as it applies to this stack.

Companion: [supabase-server architecture.md](https://github.com/AbstractNucleus/supabase-server/blob/main/docs/architecture.md) — the proven pattern this spec mirrors.

Scope bound: this is the first of several Phase 2 specs. It covers ingress consolidation only — no new features. The deferred Phase 2 work (Beszel SQLite backups, deploy annotations, long-term retention, fleet tags, status page, NOC mode) lands in separate specs after this one.

---

## Goal

Replace the analytics-stack-internal Caddy with an nginx vhost on `aserver`, so the home lab has one ingress concentrator instead of two. After this ships:

- `https://analytics.noelkleen.com` resolves to **aserver's tailnet IP** (was bserver's).
- TLS terminates on **aserver** via the existing certbot + Cloudflare DNS-01 machinery (was Caddy on bserver via the `caddy-dns/cloudflare` plugin).
- aserver nginx reverse-proxies over the **LAN** to the SvelteKit container on bserver (was: Caddy in the same compose network as the frontend).
- The analytics stack on bserver no longer runs Caddy. The `caddy` service, `Caddyfile`, `caddy/` xcaddy build dir, `CLOUDFLARE_API_TOKEN` and `TS_IP` are all removed from this repo.

Done = (a) the dashboard loads at `https://analytics.noelkleen.com` from any tailnet client and is served by aserver nginx (verified by response headers / nginx access log), (b) PocketBase realtime SSE streams through nginx without buffering, (c) the analytics stack on bserver contains no Caddy artifacts, (d) the README's bring-up flow describes the nginx-on-aserver path verbatim.

---

## Why

The Phase 1 MVP shipped Caddy on bserver bound to the host's tailnet IP, terminating TLS via Cloudflare DNS-01. It works. But `aserver` already runs nginx as the public-facing edge for the supabase-server stack, including a tailnet-only Studio vhost (`studio.noelkleen.com`) using the same DNS-01 + Let's Encrypt machinery.

Running two reverse proxies — Caddy on bserver, nginx on aserver — for the same shape of work (tailnet-only TLS, reverse-proxy to a container on bserver) costs more than it earns:

- Two sets of certs, two renewal mechanisms, two failure modes.
- Two places to add a new tailnet-only service.
- An xcaddy build stage in this repo (`deploy/caddy/Dockerfile`) maintained only to get the Cloudflare DNS-01 plugin into the Caddy binary — pure incidental complexity.
- A second `CLOUDFLARE_API_TOKEN` deployment, separate from the one already on aserver.

Consolidating on nginx-on-aserver gives one ingress story for the home lab, parallels the proven supabase-server pattern, and removes a build stage from this repo.

---

## Non-goals (deferred)

- Public ingress for analytics. The dashboard remains tailnet-only. The aserver pattern supports both tailnet and public vhosts (Supabase has both — public `api.example.com` and tailnet `studio.example.com`); analytics uses the tailnet form only.
- Migrating dev mode. Dev mode (`docker-compose.override.yml`) runs the Vite dev server on `localhost:5173` and never used Caddy. Untouched.
- Adding a separate aserver-side repo for nginx snippets. The vhost lives in this repo at `deploy/nginx/snippets/analytics.conf.example`, mirroring how supabase-server keeps its own `nginx/snippets/`. aserver's `/etc/nginx/sites-available/` aggregates them.
- Changing the Beszel agent install path. The Linux/Windows installer scripts target the Beszel agent → hub WebSocket on the bserver tailnet IP port 45876, which is unaffected by ingress changes.

---

## Architecture

Two-host topology, mirroring the supabase-server Studio path:

```
Tailnet client
   │ https://analytics.noelkleen.com
   ▼
DNS (Cloudflare, gray cloud) → <aserver-tailnet-ip>
   ▼
┌─────────────────────────────── aserver ───────────────────────────────┐
│                                                                       │
│  nginx (host install)                                                 │
│    listen <aserver-tailnet-ip>:443 ssl;                               │
│    server_name analytics.noelkleen.com;                               │
│    ssl_certificate /etc/letsencrypt/live/analytics.noelkleen.com/...  │
│    location / { proxy_pass http://<bserver-lan-ip>:3001; }            │
│                                                                       │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │ LAN (192.168.x.x)
                                   ▼
┌─────────────────────────────── bserver ───────────────────────────────┐
│                                                                       │
│  frontend  (SvelteKit, adapter-node)                                  │
│    bound to <bserver-lan-ip>:3001  (host port; container :3000)       │
│                                                                       │
│  beszel-hub  (PocketBase)        — internal docker network only       │
│  beszel-agent (host pid + net)   — reports to local hub on :8090      │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Ingress paths after the change

| Path | Used by | DNS in Cloudflare | TLS | nginx binding (aserver) | Backend |
|---|---|---|---|---|---|
| `https://analytics.noelkleen.com` | Tailnet clients | Gray cloud → `<aserver-tailnet-ip>` | Let's Encrypt via DNS-01 (CF API) | `listen <aserver-tailnet-ip>:443` | `<bserver-lan-ip>:3001` (frontend) |

(For comparison, supabase-server's Studio path has identical shape — `studio.noelkleen.com` → aserver tailnet IP → `<bserver-lan-ip>:<studio-host-port>`.)

### Port assignment on bserver LAN IP

- `3000` — Supabase Studio (already taken)
- **`3001` — analytics frontend (this spec, configurable via `ANALYTICS_HOST_PORT`, default 3001)**

The container's internal port stays `3000` (SvelteKit adapter-node default). The host-side binding is `<bserver-lan-ip>:3001 → container:3000`. Each service on bserver gets a distinct LAN-IP-bound port; no two services collide.

### What goes away

- `deploy/Caddyfile`
- `deploy/caddy/Dockerfile` (xcaddy build dir)
- `caddy` service block in `deploy/docker-compose.yml`
- `caddy-data` and `caddy-config` named volumes
- `CLOUDFLARE_API_TOKEN` and `TS_IP` env vars from `deploy/.env.example`

The Cloudflare API token on aserver (`/etc/letsencrypt/cloudflare.ini`) is unchanged — it already exists for `studio.noelkleen.com`'s certbot cron and is reused for `analytics.noelkleen.com`.

---

## File-level changes

### Removed from this repo

- `deploy/Caddyfile`
- `deploy/caddy/Dockerfile`
- `deploy/caddy/` (entire directory)

### Modified

**`deploy/docker-compose.yml`** — `frontend` service gets a host-port binding; `caddy` service block is deleted; `caddy-data` and `caddy-config` volumes are deleted; `internal` network may stay or simplify (no functional impact). The `frontend` service after the change:

```yaml
frontend:
  build:
    context: ../app
    dockerfile: Dockerfile
  restart: unless-stopped
  ports:
    - "${BSERVER_LAN_IP}:${ANALYTICS_HOST_PORT}:3000"
  environment:
    PUBLIC_BESZEL_URL: "${PUBLIC_BESZEL_URL}"
    BESZEL_API_TOKEN: "${BESZEL_API_TOKEN}"
  networks:
    - internal
  depends_on:
    - beszel-hub
```

**`deploy/.env.example`** — drop `CLOUDFLARE_API_TOKEN` and `TS_IP`; add `BSERVER_LAN_IP` and `ANALYTICS_HOST_PORT=3001`. Final shape:

```
BESZEL_VERSION=0.18.7
BESZEL_AGENT_KEY=
BESZEL_API_TOKEN=
PUBLIC_BESZEL_URL=http://beszel-hub:8090
BSERVER_LAN_IP=192.168.x.x         # bserver's LAN IPv4 (`ip -4 addr show`)
ANALYTICS_HOST_PORT=3001           # host port on BSERVER_LAN_IP for the frontend
```

**`README.md`** — "First-time setup on bserver" rewritten to remove the Caddy / Cloudflare / TS_IP variables, point at `BSERVER_LAN_IP` and `ANALYTICS_HOST_PORT` instead, and add an "On aserver" section that mirrors supabase-server's TLS-setup flow:

```sh
# On aserver:
sudo certbot certonly --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    -d analytics.noelkleen.com
# Copy deploy/nginx/snippets/analytics.conf.example into
#   /etc/nginx/sites-available/analytics.conf, edit, symlink, reload.
sudo nginx -t && sudo systemctl reload nginx
```

The README also gets a new "DNS in Cloudflare" subsection: change `analytics.noelkleen.com` A record from `<bserver-TS-IP>` to `<aserver-TS-IP>`, gray cloud (DNS-only).

### Added

**`deploy/nginx/snippets/analytics.conf.example`** — paste-ready nginx vhost for aserver. Mirrors supabase-server's `nginx/snippets/supabase-studio.conf.example` with three substitutions: domain → `analytics.noelkleen.com`, upstream → `<bserver-lan-ip>:<analytics-host-port>`, and one functional addition: PocketBase realtime needs SSE-friendly proxy settings (`proxy_buffering off`, long `proxy_read_timeout`, `Connection ""` rather than `upgrade` for SSE — websockets stay on `Connection: upgrade`).

Concrete shape (placeholders match the supabase-server convention):

```nginx
# deploy/nginx/snippets/analytics.conf.example
#
# Tailnet-only analytics dashboard for analytics.<your-domain>.
# Lives on aserver. Uses Let's Encrypt cert via DNS-01.
#
# Install:
#   1. Copy to /etc/nginx/sites-available/analytics.conf
#   2. Edit: <your-domain>, <bserver-lan-ip>, <analytics-host-port>, <aserver-tailnet-ip>.
#   3. ln -s /etc/nginx/sites-available/analytics.conf /etc/nginx/sites-enabled/
#   4. sudo nginx -t && sudo systemctl reload nginx

server {
    listen <aserver-tailnet-ip>:443 ssl;
    http2 on;
    server_name analytics.<your-domain>;

    ssl_certificate     /etc/letsencrypt/live/analytics.<your-domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analytics.<your-domain>/privkey.pem;

    # Inline TLS hardening (mirror of supabase-server's pattern; LE chain).
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/analytics.<your-domain>/chain.pem;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://<bserver-lan-ip>:<analytics-host-port>;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Websocket (Beszel agents don't pass through here, but adapter-node
        # may upgrade for HMR-like flows; harmless to keep).
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_http_version 1.1;

        proxy_read_timeout 300s;
    }

    # PocketBase realtime: SSE — long-lived response, no buffering.
    location /api/realtime {
        proxy_pass http://<bserver-lan-ip>:<analytics-host-port>;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Connection        "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}
```

**`docs/decisions/2026-04-26-nginx-ingress.md`** — short decision record. Captures: the choice (nginx-on-aserver), the rejected alternative (keep Caddy-on-bserver), why the supabase-server pattern won, and the date.

---

## Cutover plan

One session, both hosts, total user-visible downtime <5 min. Runs on top of a working Phase 1 deploy (Caddy currently serving `analytics.noelkleen.com` on bserver TS_IP).

1. **Pre-flight on aserver.** Issue the LE cert via DNS-01: `sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini -d analytics.noelkleen.com`. No traffic moves; nothing user-facing changes. Cert lands in `/etc/letsencrypt/live/analytics.noelkleen.com/`.

2. **Stage the nginx vhost on aserver.** Copy `deploy/nginx/snippets/analytics.conf.example` into `/etc/nginx/sites-available/analytics.conf`. Edit placeholders. **Do not symlink into `sites-enabled/` yet.** `sudo nginx -t` to check syntax against the staged file.

3. **On bserver: publish the new host port.** `git pull` the new `docker-compose.yml`. Edit `.env` to add `BSERVER_LAN_IP` and `ANALYTICS_HOST_PORT=3001`. `docker compose up -d frontend` — the container now listens on `<bserver-lan-ip>:3001` in addition to its internal compose-network port. Caddy still runs and still serves `analytics.noelkleen.com` on bserver's TS_IP. Both paths active simultaneously.

4. **Verify the new path internally** from aserver:
   - `curl -H "Host: analytics.noelkleen.com" http://<bserver-lan-ip>:3001/` returns the SSR'd dashboard HTML.
   - If the SvelteKit app exposes any long-lived endpoint (e.g., a server-sent-events relay), curl it and confirm it doesn't close immediately. If realtime is purely server-side (SvelteKit subscribes to the hub on the docker network, browser only sees SSR/hydration), this sub-step is moot — note it and move on. Either way, the SSE-friendly nginx location block stays as future-proofing for browser-side subscription work.

5. **Enable the nginx vhost on aserver.** `sudo ln -s /etc/nginx/sites-available/analytics.conf /etc/nginx/sites-enabled/`. `sudo nginx -t && sudo systemctl reload nginx`. The vhost is live but no clients reach it yet (DNS still points at bserver).

6. **Flip DNS in Cloudflare.** Change the `analytics.noelkleen.com` A record from `<bserver-TS-IP>` → `<aserver-TS-IP>`. Stays gray cloud. Lower TTL to 60s a few minutes ahead if you want a tighter cutover window.

7. **Verify from a tailnet client.** `dig analytics.noelkleen.com` returns aserver's TS IP. `curl -v https://analytics.noelkleen.com/` shows the LE cert chain and a 200. Browser: dashboard loads, time-range toggle works, fleet view streams updates (proves SSE through nginx).

8. **Tear down Caddy on bserver.** `docker compose stop caddy && docker compose rm -f caddy`. `docker volume rm analytics_caddy-data analytics_caddy-config` (volume names are compose-prefixed; verify with `docker volume ls`). Delete `deploy/Caddyfile`, `deploy/caddy/`, the `caddy` service block, and the two volumes from `docker-compose.yml`. Drop `CLOUDFLARE_API_TOKEN` and `TS_IP` from `.env.example` (and from the live `.env`). Commit all of it as one cleanup PR.

---

## Risk + rollback

| Risk | Detection | Rollback |
|---|---|---|
| LE cert issuance fails (CF token scope wrong, domain typo) | certbot exits non-zero in step 1 | None needed; nothing user-facing changed. Fix the input, re-run. |
| nginx vhost syntax error | `nginx -t` red in step 2 or 5 | Don't symlink (step 2) or revert the symlink + reload (step 5). |
| SSE doesn't stream through nginx (only relevant if the SvelteKit app exposes a long-lived endpoint to the browser) | Step 4 SSE curl closes immediately, or browser devtools show the SSE response ending after a few seconds | The buffering knobs (`proxy_buffering off`, `Connection ""`, long `proxy_read_timeout`) are in the wrong location block, or the upstream URL is wrong. Fix the snippet, reload. Don't proceed to step 5/6. |
| Frontend fails to bind LAN port (port already in use) | `docker compose up -d frontend` errors at step 3 | Choose a different `ANALYTICS_HOST_PORT`, restart. |
| Post-flip outage (any reason) | Step 7 fails | Revert the DNS A record to `<bserver-TS-IP>`. Caddy is still running; the bserver-TS-IP path was never torn down. Diagnose, retry. |

The ordering — certs first, vhost staged-then-enabled, DNS flipped only after end-to-end internal verification, Caddy torn down only after DNS is confirmed flipped — keeps the Caddy path as a hot rollback target until the very last step.

---

## Verification

A pass-condition checklist for "this is done":

1. `dig +short analytics.noelkleen.com` returns `<aserver-tailnet-ip>`.
2. `curl -sI https://analytics.noelkleen.com/` returns `200`, `Server: nginx/...`, and a Let's Encrypt certificate chain (verifiable via `openssl s_client -connect analytics.noelkleen.com:443 -servername analytics.noelkleen.com </dev/null | openssl x509 -noout -issuer`).
3. Dashboard loads in a browser on a tailnet client. Fleet view shows live updates (events stream through `/api/realtime`).
4. `docker compose ps` on bserver lists no `caddy` service.
5. `git grep -i caddy` in this repo returns only historical references (decisions doc, this spec). No Caddyfile, no caddy/ dir, no `caddy:` service block, no `CLOUDFLARE_API_TOKEN` or `TS_IP` references in `.env.example` or `docker-compose.yml`.
6. `aserver:/etc/letsencrypt/renewal/analytics.noelkleen.com.conf` exists; `sudo certbot renew --dry-run` succeeds (proves auto-renewal works).
7. README "First-time setup" is reproducible: a fresh reader following it lands at a green dashboard with no Caddy mentioned.

---

## Decisions

- **nginx on aserver, not Caddy on bserver.** Locked by user 2026-04-26. Reason: one ingress concentrator for the home lab, parallels the supabase-server Studio pattern, drops an xcaddy build stage from this repo.
- **`ANALYTICS_HOST_PORT=3001`** as the LAN-IP-bound port. Studio holds 3000; analytics gets the next integer. Configurable via env so future moves are cheap.
- **nginx vhost lives in this repo**, not in supabase-server's. Each service owns its own ingress snippet; aserver aggregates them in `/etc/nginx/sites-available/`. Same boundary supabase-server already established.
- **Caddy data volumes are deleted, not retained.** They held only LE cert state for a domain Caddy no longer manages — keeping them just leaves orphan data.
- **HSTS stays.** Tailnet-only and we control all the clients; no risk from a one-year max-age commitment.
- **Dev mode untouched.** Vite dev server on `localhost:5173` never used Caddy and doesn't need nginx.

## Rejected alternatives

- **Keep Caddy on bserver.** Works, but doubles ingress operational surface and keeps the xcaddy build stage in this repo. The user explicitly chose nginx-everywhere.
- **Run Caddy on aserver instead of nginx.** Would consolidate to one reverse proxy but require introducing Caddy to a host that already runs nginx and has working certbot timers. Net loser vs. extending nginx.
- **Bind frontend to `0.0.0.0:3001` on bserver.** Wider attack surface than necessary — anyone on bserver's LAN could hit the dashboard directly, bypassing nginx's TLS. Binding to `<bserver-lan-ip>` mirrors the supabase-server pattern and limits the exposure to the LAN interface only.
- **Use Tailscale Funnel or `serve`.** Avoids nginx entirely but couples ingress to Tailscale's daemon and gives up the existing certbot machinery. Out of step with the established pattern.

---

## Out of scope (deferred Phase 2 specs)

- **Beszel SQLite backups (B).** Will reuse the supabase-server restic→B2 pattern verbatim. Separate spec.
- **Deploy annotations (D).** Vertical markers on charts at deploy timestamps; will store events in shared Postgres on bserver. Separate spec.
- **Long-term retention (F).** Sidecar that writes Beszel `system_stats` to Postgres at low resolution for >30d retention. Separate spec.
- **Fleet tags / groups (G), public status page (H), NOC TV mode (I).** Separate specs each, prioritized after B and D.
