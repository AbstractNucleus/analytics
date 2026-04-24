# Decision — Beszel v0.18.7 schema conformance deferred to Phase 1.5

**Date:** 2026-04-24
**Status:** Acknowledged, fix scheduled post-Phase-1-MVP deploy
**Related:** [FIXTURES_README.md](../../app/tests/fixtures/FIXTURES_README.md), [#8](https://github.com/AbstractNucleus/analytics/pull/8), [#10](https://github.com/AbstractNucleus/analytics/pull/10), [#12](https://github.com/AbstractNucleus/analytics/pull/12)

## Context

Phase 1 MVP shipped with synthesized Beszel fixtures because no live hub was reachable at build time. The synthesized `systems.info`, `containers`, and `SystemStatus` shapes were written to what we *assumed* was the v0.18.7 schema.

On 2026-04-24 a throwaway `henrygd/beszel:0.18.7` hub was spun up and its collection schemas inspected via the PocketBase admin API. The real schema differs from the synthesized fixtures in ways that affect parse code and downstream components.

## What diverged

### 1. `SystemStatus` enum

```
real:         "up" | "down" | "paused" | "pending"
synthesized:  "up" | "down" | "paused"
```

`parseSystem` falls back to `"down"` for unknown values, so a real `"pending"` row currently renders as `"down"` — wrong indicator on the fleet view when a host is being set up.

### 2. `systems.info` keys

The `info` blob on a real record holds **lightweight runtime state**, not the static hardware/OS descriptors we assumed:

```json
// real (fresh hub, no agent reporting yet):
{ "u": 0, "cpu": 0, "mp": 0, "dp": 0, "v": "", "bb": 0, "la": [0, 0, 0] }

// synthesized:
{ "cpu": 8, "m": 32, "dt": 42.5, "u": 1209600,
  "k": "6.8.0-52-generic", "os": "ubuntu 24.04", "b": 1713312000 }
```

Overlap: `u` (uptime s), `cpu` (core count — also in `system_details.cores`).

Real, not in synthesized: `mp` (mem % used, live), `dp` (disk % used, live), `v` (agent version), `bb` (beb… boot time? beta build? TBD), `la` (load average 1 / 5 / 15).

Synthesized, not in real: `m` (mem GB total), `dt`, `k`, `os`, `b` — **these live in the `system_details` collection instead**, which we never captured or parsed.

### 3. `system_details` collection (not captured at all)

A sibling collection on the hub, one row per system:

```
id, system (relation), hostname, os (number/enum), os_name (text), kernel (text),
cpu (text — descriptor), arch (text), cores (number), threads (number),
memory (number — total memory, units TBD), podman (bool), updated (autodate)
```

Everything we assumed was in `systems.info` (kernel, OS name, memory total, CPU descriptor) actually comes from here. Our per-host route doesn't fetch it, so `UptimeKernel`, `MemoryPanel`, and `DiskPanel` receive zeros/empty-strings at runtime against a real hub.

### 4. `containers` collection shape

```
real fields:         id, system, name, status, health, cpu, memory, net, image, ports, updated
synthesized fields:  id, system, name, stats: { cpu, mem, nr, ns }
```

`parseContainer` reads `r.stats.cpu`, `r.stats.mem`, `r.stats.nr`, `r.stats.ns` — **none of those paths exist in real data**. Real containers expose flat numeric fields `cpu`, `memory`, `net` plus descriptive strings `status`, `image`, `ports` and a `health` number.

### 5. `container_stats` collection (not captured at all)

Historical per-container samples in a separate collection, mirroring `system_stats`. We never fetched or parsed it.

### 6. EventSource polyfill bug

`capture-fixtures.ts` crashed with `ReferenceError: EventSource is not defined` on Node 24 when calling `pb.collection('system_stats').subscribe(...)`. PocketBase's realtime service references `new EventSource()` against the global constructor, which Node doesn't expose unconditionally. Fixed in this PR by importing the `eventsource` package and installing it on `globalThis` before any subscribe call.

## Scope of the conformance fix

Touches every layer:

- **types.ts** — add `"pending"` to `SystemStatus`; split `SystemRow` into a lean runtime shape + a new `SystemDetails` interface; redefine `ContainerRow` around the flat fields; add `ContainerStatsSample`.
- **parse.ts** — rewrite `parseSystem`, rewrite `parseContainer`, add `parseSystemDetails`, add `parseContainerStats`.
- **client.ts** — add `getSystemDetails(slug)` and `getRecentContainerStats(systemId, range)`; the interface grows by two methods.
- **hosts/[slug]/+page.server.ts** — fetch `system_details` alongside `system`; `data` gets a `systemDetails` field.
- **hosts/[slug]/+page.svelte** — pass kernel / OS / memory / disk-total from `systemDetails` into their panels.
- **MemoryPanel / DiskPanel / UptimeKernel / HostHeader** — swap props from `SystemRow` to `SystemDetails` where applicable.
- **Fixtures** — re-capture against a real hub with at least one reporting agent so `systems.info` and `system_stats.stats` land with real values. Bootstrap path: create superuser via `docker exec beszel-hub /beszel superuser upsert`, auth, add user, add system via admin API, run agent with the generated key, wait for push, run `capture-fixtures`.
- **Tests** — every parse test and every panel test re-keyed to the real shape. Count will grow; the failure mode flips from "synthesized shape matches" to "real shape matches".

## Why not fix it in this PR

Two reasons:

1. **Scope**. The refactor touches ~15 files across beszel-client and panels-and-routes, affects most of the 139 existing tests, and needs a real running agent for the fixture piece. That's another concern-sized chunk of work, not a follow-up line-item.
2. **Deploy day is the natural time**. Once the real stack is up on bserver (PR #9), a reporting agent will exist, `capture-fixtures` can produce authoritative data, and any further schema surprises surface before they get baked into a second wave of code. Doing the refactor against synthesized replacement data risks just trading one guess for another.

## What ships in this PR instead

- EventSource polyfill in `capture-fixtures.ts` — real bug, fixed.
- This decision doc — records what we found so the next pass starts from evidence.
- Docker verifications from the throwaway hub: `docker compose -f deploy/docker-compose.yml config` → exit 0, `... -f override.yml config` → exit 0, `docker build app/Dockerfile` → exit 0, `docker build deploy/caddy/Dockerfile` (xcaddy + caddy-dns/cloudflare) → exit 0. Reported in the PR body, not committed.

## Next

- Merge this PR.
- Bring up the stack on bserver, register the four real hosts.
- Open a "phase-1.5-schema-conformance" PR that re-captures fixtures against that live hub and rewrites the parse / types / panel layer to the real shapes.
