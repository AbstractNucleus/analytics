# nginx Ingress Re-Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Caddy-on-bserver with an nginx vhost on aserver, mirroring the supabase-server Studio ingress pattern, with zero net downtime.

**Architecture:** Two PRs bracketing one operational cutover. PR 1 is additive (publishes the frontend on a new LAN port + lands the nginx snippet + decision doc) so both ingress paths run side-by-side. The cutover then issues the LE cert on aserver, enables the new vhost, flips the Cloudflare A record, and verifies. PR 2 is subtractive — removes the Caddy service/files/volumes from this repo and rewrites the README to reflect the nginx-on-aserver state.

**Tech Stack:** Docker Compose (bserver), nginx + certbot + Cloudflare DNS-01 (aserver), Cloudflare DNS, SSH for ops execution.

**Source spec:** [`docs/specs/2026-04-26-nginx-ingress-design.md`](../specs/2026-04-26-nginx-ingress-design.md).

---

## Ground rules

- **Acceptance-check-first discipline.** This work is config and ops, not code. Every change pairs with a check that fails against the missing state and passes after the change lands. No unit tests to write — there's no code being added.
- **Two independent PRs, both targeting `main`.** PR 1 is merged before the cutover; PR 2 is merged after the cutover is verified. The operational cutover does not have a PR — it produces no commits, only state on aserver/bserver/Cloudflare.
- **Caddy stays alive until step 7 of the cutover passes.** Hot rollback target. PR 2 is the only thing that removes Caddy from the repo, and only runs after the cutover succeeds.
- **One commit per logical change.** Each task ends with a commit (or a noted skip).
- **Frequent verification.** Each PR step ends with a `docker compose config` check or equivalent before moving on.

---

## Concerns overview

| # | Concern | Owns | Depends on |
|---|---------|------|------------|
| 1 | `pr-1-add-nginx-path` | New: `deploy/nginx/snippets/analytics.conf.example`, `docs/decisions/2026-04-26-nginx-ingress.md`. Modified: `deploy/.env.example`, `deploy/docker-compose.yml`. | — |
| 2 | `cutover` | Operational only — LE cert on aserver, nginx vhost, DNS, verification. No file changes in this repo. | Concern 1 merged to `main`. |
| 3 | `pr-2-remove-caddy` | Removed: `deploy/Caddyfile`, `deploy/caddy/`. Modified: `deploy/docker-compose.yml`, `deploy/.env.example`, `README.md`. | Concern 2 fully verified. |

Topological order: 1 → 2 → 3.

---

# Concern 1: PR 1 — add nginx ingress path (additive)

**Branch:** `feat/phase-2-nginx-ingress-pr1`
**Depends on:** nothing.
**PR title:** `feat(deploy): publish frontend on LAN port; add nginx vhost snippet`
**Outcome:** the analytics stack still works exactly as before via Caddy, but the SvelteKit frontend is now also reachable on `<bserver-lan-ip>:<ANALYTICS_HOST_PORT>` over the LAN, and an nginx vhost snippet ready for aserver lives in the repo.

### Task 1.1: Branch from main

**Files:** none (git only).

- [ ] **Step 1.1.1: Create the branch.**

```bash
git fetch origin
git checkout -B feat/phase-2-nginx-ingress-pr1 origin/main
```

Expected: branch exists, working tree clean, HEAD at `origin/main`.

- [ ] **Step 1.1.2: Verify clean state.**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

---

### Task 1.2: Add the nginx vhost snippet

**Files:**
- Create: `deploy/nginx/snippets/analytics.conf.example`

- [ ] **Step 1.2.1: Acceptance check (failing).**

```bash
test -f deploy/nginx/snippets/analytics.conf.example && echo PRESENT || echo MISSING
```

Expected: `MISSING`.

- [ ] **Step 1.2.2: Create the directory and snippet.**

Create `deploy/nginx/snippets/analytics.conf.example` with this content (placeholders match supabase-server's convention — operator substitutes them on aserver):

```nginx
# nginx/snippets/analytics.conf.example
#
# Tailnet-only analytics dashboard for analytics.<your-domain>.
# Lives on aserver. Uses Let's Encrypt cert via DNS-01 (certbot + cloudflare plugin).
#
# Install on aserver:
#   1. Copy to /etc/nginx/sites-available/analytics.conf
#   2. Edit: replace <your-domain>, <bserver-lan-ip>, <analytics-host-port>, <aserver-tailnet-ip>.
#   3. ln -s /etc/nginx/sites-available/analytics.conf /etc/nginx/sites-enabled/
#   4. sudo nginx -t && sudo systemctl reload nginx
#
# Prerequisite: certbot DNS-01 cert obtained for analytics.<your-domain>.

server {
    # Bind to the aserver tailnet IP specifically. The existing site has
    # `listen 443 ssl;` (wildcard); nginx prefers the more specific match
    # for connections to this IP, so they coexist safely.
    listen <aserver-tailnet-ip>:443 ssl;
    http2 on;
    server_name analytics.<your-domain>;

    ssl_certificate     /etc/letsencrypt/live/analytics.<your-domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analytics.<your-domain>/privkey.pem;

    # Inline TLS hardening — mirror of supabase-server's pattern, with the
    # ssl_trusted_certificate pointing at the LE chain.
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

    # HSTS — fine here because tailnet-only and you control the clients.
    add_header Strict-Transport-Security "max-age=31536000" always;

    # NO cloudflare-ips.conf include — analytics is not behind Cloudflare's proxy.

    location / {
        proxy_pass http://<bserver-lan-ip>:<analytics-host-port>;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_http_version 1.1;

        proxy_read_timeout 300s;
    }

    # PocketBase realtime: SSE — long-lived response, no buffering.
    # Future-proofing for browser-side subscriptions; currently realtime
    # happens server-side inside the SvelteKit container.
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

- [ ] **Step 1.2.3: Acceptance check (passing).**

```bash
test -f deploy/nginx/snippets/analytics.conf.example && echo PRESENT || echo MISSING
```

Expected: `PRESENT`.

- [ ] **Step 1.2.4: Sanity-check the placeholders are present.**

```bash
grep -c '<your-domain>\|<bserver-lan-ip>\|<analytics-host-port>\|<aserver-tailnet-ip>' deploy/nginx/snippets/analytics.conf.example
```

Expected: a number ≥ 8 (each placeholder appears multiple times).

- [ ] **Step 1.2.5: Commit.**

```bash
git add deploy/nginx/snippets/analytics.conf.example
git commit -m "$(cat <<'EOF'
feat(deploy): add nginx vhost snippet for aserver

Paste-ready vhost mirroring supabase-server's supabase-studio.conf.example
with the substitutions analytics needs (domain, upstream port). Includes a
separate location block for /api/realtime with SSE-friendly buffering knobs
as future-proofing for browser-side PocketBase subscriptions.

Operator copies into /etc/nginx/sites-available/ on aserver and substitutes
the four <placeholders>. Not loaded by anything in this repo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one commit on the branch.

---

### Task 1.3: Add new env vars to `.env.example` (additive)

**Files:**
- Modify: `deploy/.env.example`

The Caddy-related vars (`CLOUDFLARE_API_TOKEN`, `TS_IP`) stay for now. They are removed in Concern 3.

- [ ] **Step 1.3.1: Acceptance check (failing).**

```bash
grep -E '^(BSERVER_LAN_IP|ANALYTICS_HOST_PORT)=' deploy/.env.example
```

Expected: no output (vars don't exist yet).

- [ ] **Step 1.3.2: Append the new vars.**

Edit `deploy/.env.example` to add these two lines at the end (preserving the existing CF/TS lines for now — they go away in Concern 3):

```
# LAN IP of bserver (`ip -4 addr show | grep -E '192.168|10\.'` on bserver).
# The frontend container's host port binds to this IP so aserver's nginx
# can reach it over the LAN.
BSERVER_LAN_IP=192.168.x.x

# Host port on BSERVER_LAN_IP that the SvelteKit frontend listens on.
# Studio (supabase-server) holds 3000; analytics gets the next integer.
ANALYTICS_HOST_PORT=3001
```

- [ ] **Step 1.3.3: Acceptance check (passing).**

```bash
grep -E '^(BSERVER_LAN_IP|ANALYTICS_HOST_PORT)=' deploy/.env.example
```

Expected: two lines —

```
BSERVER_LAN_IP=192.168.x.x
ANALYTICS_HOST_PORT=3001
```

- [ ] **Step 1.3.4: Confirm the CF/TS lines are still present (PR 1 is additive).**

```bash
grep -E '^(CLOUDFLARE_API_TOKEN|TS_IP)=' deploy/.env.example
```

Expected: two lines (the existing CF token and TS_IP entries). If they're missing, the file was over-edited — restore them.

- [ ] **Step 1.3.5: Commit.**

```bash
git add deploy/.env.example
git commit -m "$(cat <<'EOF'
feat(deploy): add BSERVER_LAN_IP and ANALYTICS_HOST_PORT to .env.example

These describe the new aserver→bserver LAN reverse-proxy path. The Caddy-
era CLOUDFLARE_API_TOKEN and TS_IP entries stay until the Caddy service is
torn down in a follow-up PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: Publish the frontend on the LAN port

**Files:**
- Modify: `deploy/docker-compose.yml`

Add a `ports` binding to the `frontend` service so it's reachable at `<bserver-lan-ip>:<ANALYTICS_HOST_PORT>` over the LAN. Caddy continues to reverse-proxy via the docker network as before — this is purely additive.

- [ ] **Step 1.4.1: Acceptance check (failing).**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config 2>&1 | grep -A 30 'frontend:' | grep -E 'ports:|published:'
```

Expected: no output (the `frontend` service has no `ports` block yet).

- [ ] **Step 1.4.2: Add the ports binding.**

In `deploy/docker-compose.yml`, locate the `frontend:` service block. Add a `ports:` entry just after `restart: unless-stopped` so the block becomes:

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

(The container's internal port stays `3000` — adapter-node default. The LAN-side binding is `<BSERVER_LAN_IP>:<ANALYTICS_HOST_PORT>`.)

- [ ] **Step 1.4.3: Acceptance check (passing).**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config 2>&1 | grep -A 40 '  frontend:' | head -20
```

Expected: a `ports:` block under `frontend:` showing the published binding `192.168.x.x:3001:3000` (placeholder values from `.env.example`).

- [ ] **Step 1.4.4: Confirm Caddy is still in the compose file.**

```bash
grep -E '^  caddy:' deploy/docker-compose.yml
```

Expected: one match (`  caddy:`). If missing, the file was over-edited; restore.

- [ ] **Step 1.4.5: Commit.**

```bash
git add deploy/docker-compose.yml
git commit -m "$(cat <<'EOF'
feat(deploy): bind frontend to BSERVER_LAN_IP:ANALYTICS_HOST_PORT

Publishes the SvelteKit container on the LAN so aserver's nginx can
reverse-proxy to it. Caddy continues to serve the same content over the
docker network at the bserver tailnet IP — both paths now active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Add the decision doc

**Files:**
- Create: `docs/decisions/2026-04-26-nginx-ingress.md`

Short ADR-style record. Mirrors the format of `docs/decisions/2026-04-24-beszel-schema-drift.md`.

- [ ] **Step 1.5.1: Acceptance check (failing).**

```bash
test -f docs/decisions/2026-04-26-nginx-ingress.md && echo PRESENT || echo MISSING
```

Expected: `MISSING`.

- [ ] **Step 1.5.2: Write the decision doc.**

Create `docs/decisions/2026-04-26-nginx-ingress.md` with this content:

```markdown
# Decision — nginx on aserver replaces Caddy on bserver

**Date:** 2026-04-26
**Status:** Approved; implementation in PRs `feat/phase-2-nginx-ingress-pr1` (additive) and `feat/phase-2-nginx-ingress-pr2` (Caddy removal), bracketing an operational cutover on bserver and aserver.
**Related:** [docs/specs/2026-04-26-nginx-ingress-design.md](../specs/2026-04-26-nginx-ingress-design.md), [supabase-server architecture.md](https://github.com/AbstractNucleus/supabase-server/blob/main/docs/architecture.md).

## Decision

Retire the Caddy reverse proxy that ships with the Phase 1 analytics stack. Replace it with an nginx vhost on `aserver` (the home lab's existing public-facing edge), bound to aserver's tailnet IP, terminating TLS via the certbot + Cloudflare DNS-01 machinery already in use for `studio.noelkleen.com`.

After the cutover:

- `analytics.noelkleen.com` resolves to aserver's tailnet IP (was bserver's).
- TLS terminates on aserver via Let's Encrypt (was on bserver via Caddy + caddy-dns/cloudflare).
- aserver's nginx reverse-proxies over the LAN to `<bserver-lan-ip>:<ANALYTICS_HOST_PORT>` (was: Caddy → frontend over the docker network).
- This repo no longer contains `deploy/Caddyfile`, `deploy/caddy/`, the `caddy:` compose service, the `caddy-data` / `caddy-config` volumes, or the `CLOUDFLARE_API_TOKEN` / `TS_IP` env vars.

## Why

Phase 1 shipped a working Caddy on bserver. It worked. But aserver already runs nginx as the public-facing edge for the supabase-server stack, and Studio (`studio.noelkleen.com`) uses the same DNS-01 + Let's Encrypt machinery. Running two reverse proxies for the same shape of work — tailnet-only TLS, reverse-proxy to a container on bserver — costs more than it earns:

- Two cert renewal mechanisms, two failure modes.
- Two places to add the next tailnet-only home service.
- An xcaddy build stage in this repo (`deploy/caddy/Dockerfile`) maintained only to embed the Cloudflare DNS-01 plugin into the Caddy binary — pure incidental complexity.
- A second deployment of the Cloudflare API token, separate from the one already on aserver.

Consolidating on nginx-on-aserver gives one ingress story for the home lab, parallels the proven supabase-server pattern, and removes a build stage from this repo.

## Rejected alternatives

- **Keep Caddy on bserver.** Works, but doubles ingress operational surface and keeps the xcaddy build stage in this repo. Explicitly rejected by the user 2026-04-26.
- **Run Caddy on aserver instead of nginx.** Would consolidate to one reverse proxy but require introducing Caddy to a host that already runs nginx with working certbot timers. Net loser vs. extending nginx.
- **Bind the frontend to `0.0.0.0:<ANALYTICS_HOST_PORT>` on bserver.** Wider attack surface than necessary — anyone on bserver's LAN could hit the dashboard directly, bypassing nginx's TLS. Binding to `<BSERVER_LAN_IP>` mirrors the supabase-server pattern and limits exposure to the LAN interface only.
- **Tailscale Funnel / `tailscale serve`.** Avoids nginx entirely but couples ingress to Tailscale's daemon and gives up the existing certbot machinery. Out of step with the established pattern.

## What ships in PR 1 vs. PR 2

- **PR 1 — additive.** Publishes the frontend on `<BSERVER_LAN_IP>:<ANALYTICS_HOST_PORT>`. Adds the nginx vhost snippet to the repo. Adds this decision doc. Both Caddy and nginx paths can serve afterward; nothing is broken.
- **Cutover** between PRs — operational only, no commits. LE cert on aserver, stage + enable nginx vhost, restart frontend on bserver with the new env vars, flip the Cloudflare A record, verify end-to-end.
- **PR 2 — subtractive.** Removes `deploy/Caddyfile`, `deploy/caddy/`, the `caddy:` service block, the two Caddy volumes, and the `CLOUDFLARE_API_TOKEN` / `TS_IP` env vars. Rewrites the README's "First-time setup" section to describe the nginx-on-aserver flow.

## Next

- Merge PR 1.
- Execute the cutover (spec §"Cutover plan" steps 1–7).
- Open PR 2 for the Caddy removal + README rewrite.
- Follow-up Phase 2 specs: Beszel SQLite backups (B), deploy annotations (D), longer-term retention (F).
```

- [ ] **Step 1.5.3: Acceptance check (passing).**

```bash
test -f docs/decisions/2026-04-26-nginx-ingress.md && echo PRESENT || echo MISSING
```

Expected: `PRESENT`.

- [ ] **Step 1.5.4: Commit.**

```bash
git add docs/decisions/2026-04-26-nginx-ingress.md
git commit -m "$(cat <<'EOF'
docs: record nginx-on-aserver decision

Captures the choice, the rejected alternatives, and the PR-1/cutover/PR-2
sequencing so the next pass starts from documented context rather than
inference.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.6: Local verification

**Files:** none (verification only).

- [ ] **Step 1.6.1: Compose config parses.**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config > /dev/null && echo OK
```

Expected: `OK`. (No errors written to stderr.)

- [ ] **Step 1.6.2: Compose config with override parses.**

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml --env-file deploy/.env.example config > /dev/null && echo OK
```

Expected: `OK`.

- [ ] **Step 1.6.3: Caddy and frontend both still in the compose graph.**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config | grep -E '^  (caddy|frontend):'
```

Expected: two lines —

```
  caddy:
  frontend:
```

- [ ] **Step 1.6.4: app tests still pass (no SvelteKit changes here, but confirm nothing was inadvertently touched).**

```bash
pnpm -C app test
```

Expected: green (139 tests across 22 files at Phase 1 completion; this PR doesn't change the count).

---

### Task 1.7: Push and open PR 1

**Files:** none (git/GitHub only).

- [ ] **Step 1.7.1: Push the branch.**

```bash
git push -u origin feat/phase-2-nginx-ingress-pr1
```

Expected: branch pushed; PR creation URL printed by gh.

- [ ] **Step 1.7.2: Open the PR.**

```bash
gh pr create --base main --title "feat(deploy): publish frontend on LAN port; add nginx vhost snippet" --body "$(cat <<'EOF'
## Summary

Phase 2, PR 1 of 2. Additive ingress changes — both Caddy (existing) and nginx-on-aserver (new) paths can serve after this lands. No user-visible change yet.

- Adds `deploy/nginx/snippets/analytics.conf.example` — paste-ready vhost for aserver, mirrors supabase-server's `supabase-studio.conf.example`.
- Adds `BSERVER_LAN_IP` and `ANALYTICS_HOST_PORT` to `deploy/.env.example`.
- Binds the SvelteKit frontend to `\${BSERVER_LAN_IP}:\${ANALYTICS_HOST_PORT}:3000` so aserver's nginx can reverse-proxy over the LAN.
- Records the decision in `docs/decisions/2026-04-26-nginx-ingress.md`.

PR 2 (subtractive — removes Caddy, rewrites README) ships after the operational cutover. Spec: `docs/specs/2026-04-26-nginx-ingress-design.md`.

## Test plan

- [ ] `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config` exits 0
- [ ] `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml --env-file deploy/.env.example config` exits 0
- [ ] `pnpm -C app test` green
- [ ] Manual: `frontend` service in `docker compose config` output shows the new `ports:` binding
- [ ] Manual: `caddy:` service is unchanged (Caddy still serves the existing path)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 1.7.3: Note the PR number for the cutover.**

The cutover (Concern 2) requires this PR merged to `main` before bserver can `git pull` the new compose. Note the PR URL/number in the cutover log.

---

# Concern 2: Operational cutover

**Branch:** none — operational only.
**Depends on:** Concern 1's PR merged to `main`.
**Outcome:** `analytics.noelkleen.com` is served by aserver nginx with a Let's Encrypt cert, the Caddy path on bserver is no longer the live route (but Caddy is still running as a hot-rollback target).

> **SSH access required:** the executor needs shell access to `aserver` (sudo for certbot + nginx) and `bserver` (sudo for docker). The user has granted this — confirm hostnames and credentials before starting.

> **Cloudflare access required:** the executor needs API or dashboard access to edit the `analytics.noelkleen.com` A record on the `noelkleen.com` zone.

> **Pre-flight:** lower the `analytics.noelkleen.com` A record's TTL to 60 seconds at least 5 minutes before the cutover starts. This shortens the DNS-flip window. (If TTL is already low / `auto`, skip.)

### Task 2.1: Issue the LE cert on aserver

**Files:** none in this repo. Touches `/etc/letsencrypt/` on aserver.

- [ ] **Step 2.1.1: Acceptance check (failing).**

```bash
ssh aserver 'sudo test -f /etc/letsencrypt/live/analytics.noelkleen.com/fullchain.pem && echo PRESENT || echo MISSING'
```

Expected: `MISSING`.

- [ ] **Step 2.1.2: Confirm cloudflare.ini exists and is restricted.**

```bash
ssh aserver 'sudo stat -c "%a %n" /etc/letsencrypt/cloudflare.ini'
```

Expected: `600 /etc/letsencrypt/cloudflare.ini`. If different, fix permissions (`sudo chmod 600 /etc/letsencrypt/cloudflare.ini`) before issuing.

- [ ] **Step 2.1.3: Issue the cert via DNS-01.**

```bash
ssh aserver 'sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d analytics.noelkleen.com \
  --non-interactive --agree-tos -m noelhkleen@gmail.com'
```

Expected: certbot reports successful issuance, paths under `/etc/letsencrypt/live/analytics.noelkleen.com/`.

- [ ] **Step 2.1.4: Acceptance check (passing).**

```bash
ssh aserver 'sudo test -f /etc/letsencrypt/live/analytics.noelkleen.com/fullchain.pem && echo PRESENT || echo MISSING'
```

Expected: `PRESENT`.

- [ ] **Step 2.1.5: Confirm renewal will work.**

```bash
ssh aserver 'sudo certbot renew --dry-run --cert-name analytics.noelkleen.com'
```

Expected: dry run reports success.

---

### Task 2.2: Stage the nginx vhost (don't enable yet)

**Files:** none in this repo. Touches `/etc/nginx/sites-available/analytics.conf` on aserver.

- [ ] **Step 2.2.1: Acceptance check (failing).**

```bash
ssh aserver 'test -f /etc/nginx/sites-available/analytics.conf && echo PRESENT || echo MISSING'
```

Expected: `MISSING`.

- [ ] **Step 2.2.2: Pull the snippet from the merged PR.**

```bash
ssh aserver 'cd ~/analytics && git pull origin main'
```

Expected: `analytics.conf.example` now visible at `~/analytics/deploy/nginx/snippets/analytics.conf.example`. (If the repo isn't cloned on aserver yet, `git clone` it first.)

- [ ] **Step 2.2.3: Copy and substitute placeholders.**

Discover the substitution values on aserver:

```bash
ssh aserver 'tailscale ip -4'           # → ASERVER_TAILNET_IP
ssh bserver 'ip -4 -br addr show | grep -v lo'  # → identify BSERVER_LAN_IP (192.168.x.x or 10.x.x.x)
```

Note the values. Then on aserver:

```bash
ssh aserver 'sudo cp ~/analytics/deploy/nginx/snippets/analytics.conf.example /etc/nginx/sites-available/analytics.conf'
ssh aserver 'sudo sed -i \
  -e "s/<your-domain>/noelkleen.com/g" \
  -e "s/<aserver-tailnet-ip>/<ASERVER_TAILNET_IP>/g" \
  -e "s/<bserver-lan-ip>/<BSERVER_LAN_IP>/g" \
  -e "s/<analytics-host-port>/3001/g" \
  /etc/nginx/sites-available/analytics.conf'
```

(Substitute the noted IP values into the sed command.)

- [ ] **Step 2.2.4: Confirm no placeholders remain.**

```bash
ssh aserver 'sudo grep -E "<[a-z-]+>" /etc/nginx/sites-available/analytics.conf || echo CLEAN'
```

Expected: `CLEAN`.

- [ ] **Step 2.2.5: nginx -t against the staged file (without symlinking).**

The staged file isn't symlinked into `sites-enabled/` yet, so `nginx -t` won't load it. Validate it standalone:

```bash
ssh aserver 'sudo nginx -t -c /etc/nginx/nginx.conf -g "include /etc/nginx/sites-available/analytics.conf;"' 2>&1 | tail -5
```

Expected: `nginx: configuration file ... test is successful`.

(If nginx complains about missing cert files, the cert from Task 2.1 didn't land — go back and verify.)

---

### Task 2.3: Republish frontend with the new LAN binding on bserver

**Files:** none in this repo. Touches `~/analytics/deploy/.env` on bserver and the running compose stack.

- [ ] **Step 2.3.1: Acceptance check (failing).**

```bash
ssh bserver 'curl -fsS -m 3 -o /dev/null -w "%{http_code}\n" -H "Host: analytics.noelkleen.com" http://<BSERVER_LAN_IP>:3001/ || echo FAIL'
```

Expected: `FAIL` or a connection-refused error (port 3001 isn't bound yet).

- [ ] **Step 2.3.2: Pull the merged PR on bserver.**

```bash
ssh bserver 'cd ~/analytics && git pull origin main'
```

Expected: the merged docker-compose.yml + .env.example are now on bserver.

- [ ] **Step 2.3.3: Add the new env vars to the live `.env`.**

```bash
ssh bserver 'cd ~/analytics/deploy && \
  grep -q "^BSERVER_LAN_IP=" .env || echo "BSERVER_LAN_IP=<BSERVER_LAN_IP>" >> .env && \
  grep -q "^ANALYTICS_HOST_PORT=" .env || echo "ANALYTICS_HOST_PORT=3001" >> .env'
```

(Substitute the actual `<BSERVER_LAN_IP>`.)

Confirm:

```bash
ssh bserver 'cd ~/analytics/deploy && grep -E "^(BSERVER_LAN_IP|ANALYTICS_HOST_PORT)=" .env'
```

Expected: two lines with the populated values.

- [ ] **Step 2.3.4: Bring up the frontend with the new binding.**

```bash
ssh bserver 'cd ~/analytics/deploy && docker compose up -d frontend'
```

Expected: `frontend` recreates, comes up healthy.

- [ ] **Step 2.3.5: Acceptance check (passing).**

```bash
ssh bserver 'curl -fsS -m 5 -o /dev/null -w "%{http_code}\n" -H "Host: analytics.noelkleen.com" http://<BSERVER_LAN_IP>:3001/'
```

Expected: `200`.

- [ ] **Step 2.3.6: Confirm Caddy is still serving the existing path.**

```bash
ssh bserver 'docker compose -f ~/analytics/deploy/docker-compose.yml ps caddy'
```

Expected: `caddy` listed as `running`.

```bash
curl -fsS -m 5 -o /dev/null -w "%{http_code}\n" --resolve analytics.noelkleen.com:443:<BSERVER_TAILNET_IP> https://analytics.noelkleen.com/
```

(Replace `<BSERVER_TAILNET_IP>` with the bserver TS IP. Run from a tailnet client.)

Expected: `200` (Caddy still answering).

---

### Task 2.4: Verify the new path internally

**Files:** none.

- [ ] **Step 2.4.1: Curl from aserver to bserver over LAN.**

```bash
ssh aserver 'curl -fsS -m 5 -o /dev/null -w "%{http_code}\n" -H "Host: analytics.noelkleen.com" http://<BSERVER_LAN_IP>:3001/'
```

Expected: `200`.

- [ ] **Step 2.4.2: Pull a route to confirm SSR works.**

```bash
ssh aserver 'curl -fsS -m 5 -H "Host: analytics.noelkleen.com" http://<BSERVER_LAN_IP>:3001/ | head -20'
```

Expected: HTML output, recognizable as the dashboard (look for `<html`, `<title>`, etc.).

- [ ] **Step 2.4.3: SSE check (optional, skip-if-N/A).**

If the SvelteKit app exposes any long-lived endpoint (e.g., a server-sent-events relay), curl it and confirm it doesn't immediately close. As of Phase 1, PocketBase realtime happens server-side inside the SvelteKit container — the browser doesn't subscribe directly. If no long-lived endpoint is exposed through the frontend, skip this step and note it in the cutover log.

```bash
ssh aserver 'timeout 5 curl -N -fsS -H "Host: analytics.noelkleen.com" http://<BSERVER_LAN_IP>:3001/<long-lived-endpoint>; echo "EXIT $?"'
```

Expected if endpoint exists: `EXIT 124` (curl killed by timeout — connection stayed open). Anything else closing immediately means the buffering knobs in nginx are wrong (but we haven't enabled nginx yet — this only matters at step 2.6).

---

### Task 2.5: Enable the nginx vhost on aserver

**Files:** none in this repo. Touches `/etc/nginx/sites-enabled/` on aserver.

- [ ] **Step 2.5.1: Acceptance check (failing).**

```bash
ssh aserver 'test -L /etc/nginx/sites-enabled/analytics.conf && echo PRESENT || echo MISSING'
```

Expected: `MISSING`.

- [ ] **Step 2.5.2: Symlink and validate.**

```bash
ssh aserver 'sudo ln -s /etc/nginx/sites-available/analytics.conf /etc/nginx/sites-enabled/analytics.conf && sudo nginx -t' 2>&1 | tail -5
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.

If `nginx -t` fails:

```bash
ssh aserver 'sudo rm /etc/nginx/sites-enabled/analytics.conf'
```

… and fix the staged file before retrying.

- [ ] **Step 2.5.3: Reload nginx.**

```bash
ssh aserver 'sudo systemctl reload nginx'
```

Expected: no output, exit 0.

- [ ] **Step 2.5.4: Acceptance check (passing).**

```bash
ssh aserver 'test -L /etc/nginx/sites-enabled/analytics.conf && echo PRESENT || echo MISSING'
ssh aserver 'systemctl is-active nginx'
```

Expected: `PRESENT` and `active`.

- [ ] **Step 2.5.5: Verify nginx serves the vhost (still resolving DNS to bserver).**

From a tailnet client, force a connection to aserver:

```bash
curl -fsS -m 5 -k --resolve analytics.noelkleen.com:443:<ASERVER_TAILNET_IP> -o /dev/null -w "%{http_code}\n" https://analytics.noelkleen.com/
```

Expected: `200`. (`-k` because we're forcing an SNI mismatch-free path; the cert IS valid here, but the `--resolve` overrides DNS and `-k` is belt-and-braces.)

---

### Task 2.6: Flip DNS in Cloudflare

**Files:** none.

- [ ] **Step 2.6.1: Acceptance check (failing — pre-flip).**

```bash
dig +short analytics.noelkleen.com @1.1.1.1
```

Expected: `<BSERVER_TAILNET_IP>`.

- [ ] **Step 2.6.2: Edit the A record.**

In the Cloudflare dashboard (or via the API), update the `analytics.noelkleen.com` A record:

- **From:** `<BSERVER_TAILNET_IP>`
- **To:** `<ASERVER_TAILNET_IP>`
- **Proxy status:** DNS only (gray cloud) — must NOT be orange-clouded.
- **TTL:** keep at the lowered value from pre-flight (60s) for now.

- [ ] **Step 2.6.3: Acceptance check (passing).**

Wait up to TTL seconds, then:

```bash
dig +short analytics.noelkleen.com @1.1.1.1
```

Expected: `<ASERVER_TAILNET_IP>`.

If still showing the old IP after 2× TTL, query a different resolver:

```bash
dig +short analytics.noelkleen.com @8.8.8.8
```

If different resolvers disagree, propagation is in progress — wait another minute.

---

### Task 2.7: Verify end-to-end from a tailnet client

**Files:** none.

- [ ] **Step 2.7.1: TLS chain check.**

```bash
openssl s_client -connect analytics.noelkleen.com:443 -servername analytics.noelkleen.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject
```

Expected: `issuer=C=US, O=Let's Encrypt, ...` and `subject=CN=analytics.noelkleen.com`.

- [ ] **Step 2.7.2: HTTP response check.**

```bash
curl -fsSI https://analytics.noelkleen.com/ | head -5
```

Expected: `HTTP/2 200`, and a `server: nginx/...` header (proves nginx is serving, not Caddy).

- [ ] **Step 2.7.3: Browser smoke test.**

Open `https://analytics.noelkleen.com/` in a browser on a tailnet client. Verify:

- Dashboard loads.
- Fleet view shows live updates over a few seconds (proves the realtime path works through the SvelteKit container; if realtime is server-side, the SSR output will show fresh data on a hard refresh).
- Time-range toggle (1h / 24h / 7d / 30d) re-fetches without errors.
- Theme toggle works.

If any of these fail, **roll back DNS** (Task 2.8) and diagnose before retrying.

- [ ] **Step 2.7.4: Restore TTL to default.**

In Cloudflare, set the `analytics.noelkleen.com` A record TTL back to `auto` (or whatever the previous default was). Cutover window is closed.

---

### Task 2.8: Rollback procedure (only if needed)

**Files:** none. **Run only if Task 2.7 fails.**

- [ ] **Step 2.8.1: Revert the A record.**

In Cloudflare, change `analytics.noelkleen.com` back to `<BSERVER_TAILNET_IP>`. Caddy is still running and will resume serving as soon as DNS propagates.

- [ ] **Step 2.8.2: Verify rollback.**

```bash
# Wait TTL seconds, then:
dig +short analytics.noelkleen.com @1.1.1.1
curl -fsSI https://analytics.noelkleen.com/ | head -5
```

Expected: A record returns `<BSERVER_TAILNET_IP>`; `server:` header is `Caddy` again.

- [ ] **Step 2.8.3: Diagnose.**

Common causes:
- nginx vhost typo → `ssh aserver 'sudo tail -50 /var/log/nginx/error.log'`.
- Frontend not bound to LAN port → re-run Task 2.3 acceptance check.
- Cert chain wrong → check `ssl_certificate` paths in the vhost match what certbot wrote.
- LAN connectivity → from aserver, `ping <BSERVER_LAN_IP>` and `nc -zv <BSERVER_LAN_IP> 3001`.

Fix and re-run Tasks 2.5 → 2.7 (no need to re-issue the cert or re-bind the frontend).

---

# Concern 3: PR 2 — remove Caddy + finalize README

**Branch:** `feat/phase-2-nginx-ingress-pr2`
**Depends on:** Concern 2 verified end-to-end (Task 2.7 green).
**PR title:** `chore(deploy): remove Caddy; rewrite README for nginx-on-aserver`
**Outcome:** Caddy is gone from the repo. The README's "First-time setup" section describes the new bring-up flow with no Caddy mentions. The live `caddy` container on bserver is also stopped and its volumes deleted.

### Task 3.1: Branch from main

**Files:** none (git only).

- [ ] **Step 3.1.1: Branch off post-PR-1 main.**

```bash
git fetch origin
git checkout -B feat/phase-2-nginx-ingress-pr2 origin/main
```

Expected: branch exists, working tree clean.

- [ ] **Step 3.1.2: Verify the PR 1 changes are present (they should be, since main has been updated).**

```bash
test -f deploy/nginx/snippets/analytics.conf.example && echo PRESENT || echo MISSING
grep -E '^  ports:' deploy/docker-compose.yml | head -3
```

Expected: `PRESENT` and at least one `ports:` line (the frontend's binding from PR 1).

---

### Task 3.2: Stop Caddy on bserver

**Files:** none in this repo. Touches the running compose stack on bserver.

The container needs to stop before deleting its compose service block, otherwise compose orphans it.

- [ ] **Step 3.2.1: Acceptance check (Caddy currently running).**

```bash
ssh bserver 'docker compose -f ~/analytics/deploy/docker-compose.yml ps caddy --format "{{.Name}} {{.Status}}"'
```

Expected: a line showing `caddy` running.

- [ ] **Step 3.2.2: Stop and remove the container.**

```bash
ssh bserver 'cd ~/analytics/deploy && docker compose stop caddy && docker compose rm -f caddy'
```

Expected: stop and removal report success.

- [ ] **Step 3.2.3: Note the volume names for deletion in step 3.6.**

```bash
ssh bserver 'docker volume ls --format "{{.Name}}" | grep caddy'
```

Expected: two names like `analytics_caddy-data` and `analytics_caddy-config` (project prefix may differ — note the actual names).

---

### Task 3.3: Remove Caddy files from the repo

**Files:**
- Delete: `deploy/Caddyfile`
- Delete: `deploy/caddy/` (entire directory, includes `Dockerfile`)

- [ ] **Step 3.3.1: Acceptance check (failing — files still present).**

```bash
test -f deploy/Caddyfile && echo CADDYFILE_PRESENT || echo CADDYFILE_GONE
test -d deploy/caddy && echo CADDYDIR_PRESENT || echo CADDYDIR_GONE
```

Expected: `CADDYFILE_PRESENT` and `CADDYDIR_PRESENT`.

- [ ] **Step 3.3.2: Delete via git.**

```bash
git rm deploy/Caddyfile
git rm -r deploy/caddy
```

Expected: both removals staged.

- [ ] **Step 3.3.3: Acceptance check (passing).**

```bash
test -f deploy/Caddyfile && echo CADDYFILE_PRESENT || echo CADDYFILE_GONE
test -d deploy/caddy && echo CADDYDIR_PRESENT || echo CADDYDIR_GONE
```

Expected: `CADDYFILE_GONE` and `CADDYDIR_GONE`.

- [ ] **Step 3.3.4: Commit the file deletions.**

```bash
git commit -m "$(cat <<'EOF'
chore(deploy): delete Caddyfile and xcaddy build dir

Cutover to nginx-on-aserver verified; Caddy artifacts are no longer
referenced. The compose service block and env vars come out in follow-up
commits on this branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.4: Remove the `caddy` service and volumes from `docker-compose.yml`

**Files:**
- Modify: `deploy/docker-compose.yml`

- [ ] **Step 3.4.1: Acceptance check (failing — caddy block still present).**

```bash
grep -E '^  caddy:' deploy/docker-compose.yml && echo CADDY_PRESENT || echo CADDY_GONE
grep -E '^  caddy-(data|config):' deploy/docker-compose.yml
```

Expected: `CADDY_PRESENT`, plus two volume lines (`caddy-data:` and `caddy-config:`).

- [ ] **Step 3.4.2: Remove the `caddy:` service block.**

Edit `deploy/docker-compose.yml`. Delete the entire `caddy:` service stanza (everything from `  caddy:` through its `depends_on` block). The `services:` section after editing should contain only: `beszel-hub`, `beszel-agent`, `frontend`.

Also delete the two top-level volume entries:

```yaml
volumes:
  hub-data:
  caddy-data:    # ← delete
  caddy-config:  # ← delete
```

After editing, the bottom should read:

```yaml
volumes:
  hub-data:
```

Also update the file's header comment if it mentions Caddy. Replace the existing top comment with:

```yaml
# Analytics stack: Beszel hub + agent, SvelteKit frontend.
# Tailnet ingress is provided by aserver's nginx (see deploy/nginx/snippets/
# and the README's "On aserver" section). The frontend is published on
# ${BSERVER_LAN_IP}:${ANALYTICS_HOST_PORT} so aserver can reverse-proxy over
# the LAN.
```

- [ ] **Step 3.4.3: Acceptance check (passing).**

```bash
grep -E '^  caddy:' deploy/docker-compose.yml && echo CADDY_PRESENT || echo CADDY_GONE
grep -E '^  caddy-(data|config):' deploy/docker-compose.yml || echo VOLUMES_GONE
```

Expected: `CADDY_GONE` and `VOLUMES_GONE`.

- [ ] **Step 3.4.4: Compose still parses.**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config > /dev/null && echo OK
```

Expected: `OK`.

- [ ] **Step 3.4.5: Confirm only the three remaining services are present.**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config | grep -E '^  [a-z][a-z-]*:$' | grep -v '^services:'
```

Expected: three lines — `  beszel-hub:`, `  beszel-agent:`, `  frontend:` (in some order).

- [ ] **Step 3.4.6: Commit.**

```bash
git add deploy/docker-compose.yml
git commit -m "$(cat <<'EOF'
chore(deploy): remove caddy service and caddy-data/config volumes

aserver's nginx now handles ingress. The frontend is published on the LAN
port and reverse-proxied from there. Compose graph shrinks to three
services: beszel-hub, beszel-agent, frontend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.5: Drop `CLOUDFLARE_API_TOKEN` and `TS_IP` from `.env.example`

**Files:**
- Modify: `deploy/.env.example`

- [ ] **Step 3.5.1: Acceptance check (failing).**

```bash
grep -E '^(CLOUDFLARE_API_TOKEN|TS_IP)=' deploy/.env.example && echo PRESENT || echo GONE
```

Expected: `PRESENT` (two matching lines).

- [ ] **Step 3.5.2: Remove the two entries.**

Open `deploy/.env.example`. Delete the entire blocks (comment + var) for `CLOUDFLARE_API_TOKEN` and `TS_IP`. After editing, the file should contain only entries for: `BESZEL_VERSION`, `BESZEL_AGENT_KEY`, `BESZEL_API_TOKEN`, `PUBLIC_BESZEL_URL`, `BSERVER_LAN_IP`, `ANALYTICS_HOST_PORT`.

- [ ] **Step 3.5.3: Acceptance check (passing).**

```bash
grep -E '^(CLOUDFLARE_API_TOKEN|TS_IP)=' deploy/.env.example && echo PRESENT || echo GONE
```

Expected: `GONE`.

- [ ] **Step 3.5.4: Confirm the new vars are still present.**

```bash
grep -E '^(BSERVER_LAN_IP|ANALYTICS_HOST_PORT|BESZEL_VERSION|BESZEL_AGENT_KEY|BESZEL_API_TOKEN|PUBLIC_BESZEL_URL)=' deploy/.env.example | wc -l
```

Expected: `6`.

- [ ] **Step 3.5.5: Compose with the trimmed env still parses.**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config > /dev/null && echo OK
```

Expected: `OK`.

- [ ] **Step 3.5.6: Commit.**

```bash
git add deploy/.env.example
git commit -m "$(cat <<'EOF'
chore(deploy): drop CLOUDFLARE_API_TOKEN and TS_IP from .env.example

These were Caddy's DNS-01 + tailnet-bind-IP inputs. The cert and the bind
now live on aserver (certbot + nginx); analytics' .env no longer needs them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3.5.7: Drop the same vars from the live `.env` on bserver.**

```bash
ssh bserver 'cd ~/analytics/deploy && sed -i "/^CLOUDFLARE_API_TOKEN=/d; /^TS_IP=/d; /^# Cloudflare API token/,/^$/d; /^# Tailscale IP of this host/,/^$/d" .env && grep -E "^(CLOUDFLARE_API_TOKEN|TS_IP)=" .env || echo GONE'
```

Expected: `GONE`. (Cleanup of the runtime config; the file deletion above only changed the example.)

---

### Task 3.6: Delete the orphan Caddy volumes on bserver

**Files:** none in this repo. Touches docker volumes on bserver.

- [ ] **Step 3.6.1: Acceptance check (volumes still present).**

```bash
ssh bserver 'docker volume ls --format "{{.Name}}" | grep caddy'
```

Expected: the two volume names noted in step 3.2.3 (e.g., `analytics_caddy-data`, `analytics_caddy-config`).

- [ ] **Step 3.6.2: Delete them.**

```bash
ssh bserver 'docker volume rm <volume-name-1> <volume-name-2>'
```

(Substitute the actual names from step 3.2.3.)

Expected: each name echoed back on its own line.

- [ ] **Step 3.6.3: Acceptance check (passing).**

```bash
ssh bserver 'docker volume ls --format "{{.Name}}" | grep caddy || echo GONE'
```

Expected: `GONE`.

---

### Task 3.7: Rewrite the README

**Files:**
- Modify: `README.md`

The current README has "First-time setup on bserver" with `CLOUDFLARE_API_TOKEN` and `TS_IP` instructions, an architecture diagram showing Caddy, and dev-mode commands that don't reference aserver. Rewrite to reflect the nginx-on-aserver state.

- [ ] **Step 3.7.1: Acceptance check (failing — README still mentions Caddy).**

```bash
grep -ic 'caddy\|cloudflare_api_token\|TS_IP' README.md
```

Expected: a positive integer (multiple Caddy / CF token mentions).

- [ ] **Step 3.7.2: Rewrite the relevant sections.**

Open `README.md` and apply these edits:

**(a) Architecture diagram (lines ~10-30):** replace the existing diagram with one that shows aserver nginx as the ingress:

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

Update the prose under the diagram to describe nginx terminating TLS on aserver and reverse-proxying to bserver over the LAN, instead of Caddy on bserver.

**(b) Prereqs:** drop the "Cloudflare API token" line if it was scoped to Caddy specifically; replace with a note that aserver already has the certbot + Cloudflare DNS-01 machinery from the supabase-server stack.

**(c) "First-time setup on bserver":** replace with this two-host flow:

````markdown
## First-time setup

### On bserver

```sh
git clone https://github.com/AbstractNucleus/analytics.git ~/analytics
cd ~/analytics/deploy
cp .env.example .env
```

Open `.env` and fill in:

- `BESZEL_VERSION` — already pinned; leave as-is unless you know why.
- `BSERVER_LAN_IP` — bserver's LAN IPv4 (`ip -4 -br addr show | grep -v lo`).
- `ANALYTICS_HOST_PORT` — leave at `3001` unless port 3001 is taken on bserver.
- `BESZEL_AGENT_KEY` — leave **blank** for now; filled after the hub is up.
- `BESZEL_API_TOKEN` — leave blank; created in PocketBase admin UI later.
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

# Copy the vhost snippet out of the analytics repo and substitute placeholders:
sudo cp ~/analytics/deploy/nginx/snippets/analytics.conf.example \
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

Open `https://analytics.noelkleen.com/` in a browser. Two-pass bootstrap for the bserver agent (register in PocketBase admin UI, paste the key into `.env`, restart `beszel-agent`) follows below.
````

**(d) "Two-pass bootstrap gotcha" section:** keep — unrelated to ingress.

**(e) Dev mode section:** keep largely as-is — dev never used Caddy. Drop any line that references `CLOUDFLARE_API_TOKEN` or `TS_IP` as dev requirements. Also drop the "Caddy is not used in dev" sentence (and any other Caddy mentions in the section) — Caddy no longer exists in the project, so calling out its absence in dev is dead text.

**(f) Cross-links:** add the new spec and decision doc:

```markdown
- [docs/specs/2026-04-26-nginx-ingress-design.md](docs/specs/2026-04-26-nginx-ingress-design.md)
  — Phase 2 ingress re-architecture spec.
- [docs/decisions/2026-04-26-nginx-ingress.md](docs/decisions/2026-04-26-nginx-ingress.md)
  — decision record for nginx-on-aserver.
```

- [ ] **Step 3.7.3: Acceptance check (passing).**

```bash
grep -ic 'caddy\|cloudflare_api_token\|TS_IP' README.md
```

Expected: `0`. (No Caddy or CF-token mentions left.)

- [ ] **Step 3.7.4: Confirm the new content is present.**

```bash
grep -c 'aserver\|nginx\|BSERVER_LAN_IP' README.md
```

Expected: a number ≥ 6 (the new diagram + bring-up + verify sections all reference these).

- [ ] **Step 3.7.5: Commit.**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: rewrite README for nginx-on-aserver ingress

- New architecture diagram with aserver nginx as the ingress concentrator
- "First-time setup" split into "On bserver" + "On aserver" + "In Cloudflare"
- Drop all Caddy / CLOUDFLARE_API_TOKEN / TS_IP references
- Cross-links to the Phase 2 spec and decision doc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.8: Final local verification

**Files:** none.

- [ ] **Step 3.8.1: Compose still parses with the trimmed env.**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config > /dev/null && echo OK
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml --env-file deploy/.env.example config > /dev/null && echo OK
```

Expected: `OK` twice.

- [ ] **Step 3.8.2: app tests still green.**

```bash
pnpm -C app test
```

Expected: green.

- [ ] **Step 3.8.3: No Caddy references anywhere in the repo (except historical / spec / decision references).**

```bash
git grep -i caddy
```

Expected: only matches inside `docs/specs/2026-04-26-nginx-ingress-design.md`, `docs/plans/2026-04-26-nginx-ingress-plan.md`, and `docs/decisions/2026-04-26-nginx-ingress.md`. No matches in `deploy/`, `app/`, or `README.md`.

---

### Task 3.9: Push and open PR 2

**Files:** none.

- [ ] **Step 3.9.1: Push.**

```bash
git push -u origin feat/phase-2-nginx-ingress-pr2
```

- [ ] **Step 3.9.2: Open the PR.**

```bash
gh pr create --base main --title "chore(deploy): remove Caddy; rewrite README for nginx-on-aserver" --body "$(cat <<'EOF'
## Summary

Phase 2, PR 2 of 2. Subtractive cleanup after the operational cutover to nginx-on-aserver completed successfully.

- Removes `deploy/Caddyfile`, `deploy/caddy/` (xcaddy build dir)
- Removes the `caddy:` service block and `caddy-data` / `caddy-config` volumes from `deploy/docker-compose.yml`
- Drops `CLOUDFLARE_API_TOKEN` and `TS_IP` from `deploy/.env.example`
- Rewrites `README.md` to describe the nginx-on-aserver bring-up flow with the new "On bserver" / "On aserver" / "In Cloudflare" sections
- The live `caddy` container has been stopped + removed and its volumes deleted on bserver as part of the cutover

Spec: `docs/specs/2026-04-26-nginx-ingress-design.md`. Decision: `docs/decisions/2026-04-26-nginx-ingress.md`.

## Test plan

- [ ] `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config` exits 0
- [ ] `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml --env-file deploy/.env.example config` exits 0
- [ ] `pnpm -C app test` green
- [ ] `git grep -i caddy` returns matches only inside `docs/specs/`, `docs/plans/`, `docs/decisions/` (no `deploy/` / `app/` / `README.md` matches)
- [ ] On a tailnet client: `curl -sI https://analytics.noelkleen.com/` returns `HTTP/2 200` with `server: nginx/...`
- [ ] On bserver: `docker compose ps` lists no `caddy` service
- [ ] On aserver: `sudo certbot renew --dry-run --cert-name analytics.noelkleen.com` succeeds

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

# Spec coverage map

| Spec section / requirement | Concern + Task |
|---|---|
| Goal: dashboard at `https://analytics.noelkleen.com` served by aserver nginx | 2.6, 2.7 |
| Goal: SSE streams through nginx without buffering | 2.4.3 (verify), nginx snippet location block (1.2.2) |
| Goal: analytics stack on bserver contains no Caddy artifacts | 3.2, 3.3, 3.4 |
| Goal: README describes nginx-on-aserver flow | 3.7 |
| Architecture: two-host topology (aserver edge → LAN → bserver) | 1.4 (LAN binding), 1.2 (snippet), 2.5 (enable) |
| Port assignment: `ANALYTICS_HOST_PORT=3001` | 1.3 (env), 1.4 (compose binding), 2.2 (sed substitution) |
| What goes away: Caddyfile, caddy/, service block, two volumes, CF token, TS_IP | 3.3 (files), 3.4 (service+volumes), 3.5 (env), 3.6 (live volumes) |
| Added: nginx snippet | 1.2 |
| Added: decision doc | 1.5 |
| Cutover step 1: pre-flight LE cert on aserver | 2.1 |
| Cutover step 2: stage nginx vhost (don't enable) | 2.2 |
| Cutover step 3: publish frontend host port on bserver | 2.3 |
| Cutover step 4: verify new path internally | 2.4 |
| Cutover step 5: enable nginx vhost | 2.5 |
| Cutover step 6: flip DNS | 2.6 |
| Cutover step 7: verify from tailnet client | 2.7 |
| Cutover step 8: tear down Caddy + cleanup commit | 3.2 (stop container), 3.3-3.5 (commit cleanups), 3.6 (delete volumes), 3.7 (README) |
| Risk: LE cert issuance fails | 2.1.3 (issuance step + recovery noted) |
| Risk: nginx vhost syntax error | 2.2.5, 2.5.2 (nginx -t before symlinking + before reload) |
| Risk: SSE doesn't stream | 2.4.3 (optional check, with rollback at 2.8 if needed) |
| Risk: port collision | 1.4 (binds explicitly to LAN IP), 1.3 (configurable port) |
| Risk: post-flip outage | 2.8 (rollback procedure) |
| Verification #1: dig returns aserver TS IP | 2.6.3 |
| Verification #2: curl returns 200 + LE cert + nginx server header | 2.7.1, 2.7.2 |
| Verification #3: dashboard loads in browser, fleet view streams | 2.7.3 |
| Verification #4: docker compose ps shows no caddy | 3.2.1 (before stop), implicit after 3.4 (no service to list) |
| Verification #5: git grep -i caddy returns only historical | 3.8.3 |
| Verification #6: certbot renew --dry-run succeeds | 2.1.5 |
| Verification #7: README is reproducible | 3.7 (rewrite), implicit on next fresh follower |

All spec items mapped.
