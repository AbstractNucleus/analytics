# Beszel fixtures

Real captures from a Beszel v0.18.7 hub. These replaced an earlier set of synthesized
fixtures that diverged from the actual schema — see
[docs/decisions/2026-04-24-beszel-schema-drift.md](../../../docs/decisions/2026-04-24-beszel-schema-drift.md)
for what was wrong with the synthesized shape and why this refactor happened.

## Provenance

Captured 2026-04-24 against a throwaway `henrygd/beszel:0.18.7` hub with a local
`henrygd/beszel-agent:0.18.7` reporting one system. The agent was fed the hub's public
SSH key (`GET /api/beszel/getkey`) and both containers shared a dedicated Docker network so
the hub could dial the agent's listen port (45876). After the first agent push, the hub's
collections were captured via `pnpm -C app capture-fixtures`.

Files:

- `systems.json` — array of `systems` rows. `info` carries lightweight runtime state
  (`u` uptime, `cpu` %, `mp` mem %, `dp` disk %, `v` agent version, `bb` boot time,
  `la` load average 1/5/15, `t` temp, `ct` container count). Static hardware/OS facts are
  NOT in `info` — they live in `system_details`.
- `system_details.json` — array of `system_details` rows (one per system). Holds
  `hostname`, `kernel`, `os` (number enum) / `os_name` (text), `cpu` (descriptor),
  `arch`, `cores`, `threads`, `memory` (bytes), `podman`.
- `system_stats.json` — PocketBase list-response of `system_stats` samples. Each item's
  `stats` has `cpu` %, `m`/`mu`/`mp`/`mb` memory (GB / used / % / buffer), `s` swap,
  `d`/`du`/`dp` disk (GB / used / %), `la` load avg, `ni` interfaces map (each value a
  4-tuple `[sent_bps, recv_bps, sent_total, recv_total]`), `dio` aggregate disk IO, `cpub`
  CPU breakdown 5-tuple, `cpus` per-core, `dios` per-disk IO, plus `type` rollup
  (`1m` / `10m` / `20m` / `120m` / `480m`). No top-level temp map — temp lives in
  `systems.info.t`.
- `containers.json` — array of `containers` rows. Flat fields: `cpu`, `memory`, `net`,
  `status` (text like `"Up 35 seconds"`), `health` (number), `image`, `ports`, `name`,
  `system`. `updated` is a unix-ms number on this collection, not a string.
- `container_stats.json` — PocketBase list-response of `container_stats` samples. `stats`
  is an **array** of `{n, c, m, b?}` per container (name, CPU %, memory MB, optional
  `b: [sent_bps, recv_bps]`).
- `realtime-event.json` — one SSE envelope `{ action: "create" | "update", record: <system_stats> }`
  emitted by `pb.collection('system_stats').subscribe('*', handler)`.

## How to re-capture

1. Bring up a hub with a reporting agent. Either use the production deploy (if
   reachable) or spin up a throwaway locally:

   ```bash
   docker network create beszel-capture
   docker run -d --name beszel-capture-hub --network beszel-capture -p 8090:8090 \
     henrygd/beszel:0.18.7

   # Git Bash mangles /beszel; MSYS_NO_PATHCONV=1 is required on Windows.
   MSYS_NO_PATHCONV=1 docker exec beszel-capture-hub /beszel superuser upsert \
     admin@test.local TestPassword123

   TOKEN=$(curl -s -X POST http://localhost:8090/api/collections/_superusers/auth-with-password \
     -H 'Content-Type: application/json' \
     -d '{"identity":"admin@test.local","password":"TestPassword123"}' \
     | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).token))')

   HUB_KEY=$(curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:8090/api/beszel/getkey \
     | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).key))')

   MSYS_NO_PATHCONV=1 docker run -d --name beszel-capture-agent --network beszel-capture \
     -e KEY="$HUB_KEY" -e LISTEN=45876 \
     -v "//var/run/docker.sock:/var/run/docker.sock:ro" \
     henrygd/beszel-agent:0.18.7

   # Create a user and a system record pointing to the agent container:
   USER_ID=$(curl -s -X POST http://localhost:8090/api/collections/users/records \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"email":"user@test.local","password":"UserPass123!","passwordConfirm":"UserPass123!"}' \
     | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')

   curl -s -X POST http://localhost:8090/api/collections/systems/records \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d "{\"name\":\"test-host\",\"host\":\"beszel-capture-agent\",\"port\":\"45876\",\
\"status\":\"pending\",\"users\":[\"$USER_ID\"]}"
   ```

2. Wait ~60 s for the first `1m` rollup. The system record should flip from
   `status: "pending"` to `status: "up"` and `info` should populate.

3. Run the capture script. The agent pushes on a ~60 s cadence, so the realtime
   subscription needs a window longer than that:

   ```bash
   BESZEL_URL=http://localhost:8090 BESZEL_API_TOKEN="$TOKEN" \
     REALTIME_TIMEOUT_MS=90000 pnpm -C app capture-fixtures
   ```

4. The script overwrites all six JSON files in place. If it fails ("could not reach
   hub", "no realtime event within Ns"), **don't commit** — fix the hub/agent first.
   The script intentionally refuses to write placeholders.

5. Tear down the throwaway containers:

   ```bash
   docker rm -f beszel-capture-agent beszel-capture-hub
   docker network rm beszel-capture
   ```
