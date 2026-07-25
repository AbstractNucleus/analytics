# deploy/registry/

What bserver needs to run analytics without a source tree. `compose.yml` here
gets copied to `/home/abstract/deploy/analytics/` and lives next to a `.env`.

The server holds no source and no build cache — it pulls the image that
`.github/workflows/publish-image.yml` publishes to `ghcr.io`.

## Why this is a subdirectory, not `deploy/compose.yml`

Compose picks a file by name, and `compose.yml` beats `docker-compose.yml`. Drop
a `compose.yml` next to the existing `deploy/docker-compose.yml` and every bare
`docker compose` run in `deploy/` silently switches to the pull-only file —
including the old `docker compose -p deploy up -d --build` on bserver, which
would stop building without saying so. Verified locally: Compose logs
`Using .../compose.yml` at warning level and carries on.

A subdirectory sidesteps the whole thing. `deploy/registry/` also maps 1:1 onto
`/home/abstract/deploy/analytics/`, so "copy this directory" is the deploy step.

## Which services move

| service | image | moves? |
|---|---|---|
| `frontend` | built from `app/` | **yes** — now `ghcr.io/abstractnucleus/analytics` |
| `beszel-hub` | `henrygd/beszel:${BESZEL_VERSION}` | no — third-party, already pulls |

One built image, so one workflow job and one ghcr package.

## The compose project name is `deploy`

Not `analytics`. The live stack was started with `-p deploy` and the containers
carry it:

```
ssh bserver 'docker inspect deploy-frontend-1 --format "{{index .Config.Labels \"com.docker.compose.project\"}}"'
deploy
```

`compose.yml` pins `name: deploy` so the new directory replaces those containers
in place. Without the pin Compose would name the project after its directory
(`analytics`) and:

- stand up a second stack that collides on ports 3001 and 8090, and
- create a fresh, empty `analytics_hub-data` volume, orphaning `deploy_hub-data`
  — which is Beszel's PocketBase database: every registered system, API token
  and metric it has ever recorded.

`deploy` is a bad global project name and it should eventually be `analytics`.
**Do not rename it as part of this migration.** Renaming abandons the running
containers, the `deploy_internal` network and, critically, `deploy_hub-data`.
Moving that data is its own job with its own backup step.

## One-time setup

The order matters. A package's visibility cannot be set before the package
exists, and the package does not exist until the workflow has run once.

**1. Push to `main`.** `publish-image.yml` runs and creates
`ghcr.io/abstractnucleus/analytics`.

**2. Wait for the run to go green.** `gh run watch`

**3. Check the package is publicly pullable.** bserver holds no registry
credentials, so it can only pull anonymously. Check rather than assume — a
private package is the one failure that stops the cutover dead:

```sh
ACC='application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json'
TOK=$(curl -s "https://ghcr.io/token?scope=repository:abstractnucleus/analytics:pull&service=ghcr.io" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOK" -H "Accept: $ACC" \
  https://ghcr.io/v2/abstractnucleus/analytics/manifests/latest
```

The `Accept` header is not optional. Without it ghcr returns `404` for an image
whose top level is an OCI index — which every buildx push is — and you will
think a perfectly public package is missing.

`200` means bserver can pull. `403` means the package is private or does not
exist yet:

<https://github.com/users/AbstractNucleus/packages/container/analytics/settings>
→ Danger Zone → Change visibility → Public.

Prefer that over `docker login ghcr.io` on bserver. The repo is already public
so a private image hides nothing, while a PAT would sit in plaintext at
`/home/abstract/.docker/config.json` on a host that today stores no credentials
and has no credential helper.

**4. Stage the deploy directory.** Copy the existing `.env` across rather than
retyping it — the live values are already correct and retyping them is how they
drift.

```sh
ssh bserver
mkdir -p /home/abstract/deploy/analytics
cp -p /home/abstract/repos/analytics/deploy/.env /home/abstract/deploy/analytics/.env
echo 'TAG=latest' >> /home/abstract/deploy/analytics/.env
```

Then copy `compose.yml` from this directory to
`/home/abstract/deploy/analytics/compose.yml`.

**5. Confirm the render before touching anything.** `config` only reads:

```sh
cd /home/abstract/deploy/analytics
docker compose config
```

Check `name: deploy`, `deploy_hub-data`, `deploy_internal`, and both published
ports with the right `host_ip`. If any of those differ from the running stack,
stop.

**6. Cut over.**

```sh
cd /home/abstract/deploy/analytics
docker compose pull
docker compose up -d --wait
```

Compose replaces `frontend` because its image changed. `beszel-hub` is
unchanged, so it is normally left running; if Compose does recreate it, that is
harmless — its state is all in the `deploy_hub-data` volume, which is reused
either way.

Neither service defines a healthcheck, so `--wait` blocks until the containers
are *running*, not until they are serving. Follow it with a real check:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://<BSERVER_TS_IP>:3001/
```

## The .env

Reference only — step 4 copies the real one. Do not hand-write these.

| Key | Used by |
|---|---|
| `TAG` | `latest`, or `sha-<short commit>` to pin a build. Added in step 4. |
| `BESZEL_VERSION` | hub image tag; keep in lockstep with `deploy/agent-install/*` |
| `BESZEL_API_TOKEN` | frontend's server-side reads |
| `PUBLIC_BESZEL_URL` | frontend → hub, over the compose network |
| `BSERVER_LAN_IP` | host IP both published ports bind to |
| `BSERVER_TS_IP` | second hub binding |
| `ANALYTICS_HOST_PORT` | frontend host port |
| `BESZEL_AGENT_KEY` | systemd agent installer only, not compose |
| `EXTRA_FILESYSTEMS` | systemd agent installer only, not compose |

The two IP variables currently hold the same address on bserver, so Docker
publishes one binding for the hub rather than two. That is expected. Nothing in
the stack binds `0.0.0.0`; keep it that way.

## Deploy

```sh
cd /home/abstract/deploy/analytics
docker compose pull
docker compose up -d --wait
```

## Rollback

Every build is tagged `sha-<short commit>`. Set `TAG` in the server's `.env` to
an earlier one and run the same two commands. No rebuild, no checkout.

To find the tag, read the workflow run — the summary prints every tag it pushed:

```sh
gh run list --workflow publish-image.yml
gh run view <run-id>
```

`docker image ls` on bserver is not a reliable source: only tags that have
actually been pulled to that host appear, which on day one is just `latest`.

## The old checkout

`/home/abstract/repos/analytics/deploy` still exists and its
`docker-compose.yml` claims the same compose project name once you pass
`-p deploy`. Running the old
`git pull && docker compose -p deploy up -d --build` there will rebuild from
source and silently replace the pulled image, in place, with no error — undoing
the migration while looking perfectly healthy.

That checkout also carries an uncommitted edit: it adds `CI: "true"` to the
`frontend` service's `environment`. The live container has it, so `compose.yml`
here reproduces it. It is not in git on either side.

`HOSTS.md` and the `/deploy` skill must be updated to point here before that old
path is retired.

## Keeping this file in step

`compose.yml` here and `deploy/docker-compose.yml` describe the same stack two
ways — one pulls, one builds. Change a port or add a service in one and you must
mirror it in the other. They are in the same repo so the diff shows up in the
same review.
