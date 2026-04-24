# Beszel fixtures

These JSON files stand in for real captures from a Beszel hub until one is available.

## Provenance

**Synthesized, not captured.** Hand-written to the Beszel v0.18.7 schema as documented in the
`beszel-client` concern plan and upstream project. No live hub was reachable at the time they
were written (Docker Desktop was down on the implementer's machine).

Field shapes used:

- `systems[]` — `id`, `name`, `host`, `port`, `status` ("up"|"down"|"paused"), `info` with short
  keys `cpu` (cores), `m` (RAM GB), `dt` (disk % used), `u` (uptime seconds), `k` (kernel), `os`,
  `b` (boot epoch seconds), plus standard PocketBase audit columns.
- `system_stats` — PocketBase list-response envelope (`page`, `perPage`, `totalItems`,
  `totalPages`, `items`). Each item has `system` (FK → systems.id), `type` ("1m"|"10m"|"20m"|
  "120m"|"480m"), `stats` with short keys `cpu`, `mem`, `disk` (all 0-100 %), `nr`/`ns` (net
  read/sent bytes/s), `t` (temperature sensors by name → Celsius).
- `containers[]` — `system`, `name`, `stats` with `cpu` (%), `mem` (MB), `nr`/`ns` (bytes/s).
- `realtime-event.json` — SSE envelope `{ action: "create"|"update", record: <system_stats> }`
  as emitted by `pb.collection('system_stats').subscribe('*', handler)`.

## How to replace with a real capture

1. Bring up a local Beszel hub and at least one agent:

   ```
   cd deploy && docker compose up -d beszel-hub beszel-agent
   ```

2. Wait ~30 s so the agent has pushed at least one sample.
3. Run the capture script:

   ```
   BESZEL_URL=http://localhost:8090 pnpm -C app capture-fixtures
   ```

4. The script overwrites the four JSON files in place. Re-run `pnpm -C app test` and fix any
   parse-test assertions that diverged from the synthesized shape (field casing, extra keys
   added by newer Beszel versions, etc).

If the capture script fails ("could not reach hub", "no realtime event in 10 s"), don't
commit — fix the hub/agent first. The script intentionally refuses to write placeholders.

## Why synthesized files exist at all

The plan orders this concern before deploy-stack, so the implementer cannot assume the compose
stack is ready. The synthesized fixtures unblock the `parse.ts` and `client.ts` tests; once a
hub is up, they get replaced by a real capture with no code changes required.
