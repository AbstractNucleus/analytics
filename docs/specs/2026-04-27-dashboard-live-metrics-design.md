# Dashboard live metrics — fleet rows + browser realtime

Status: approved 2026-04-27.

Closes: [#21](https://github.com/AbstractNucleus/analytics/issues/21) (fleet rows show `—` placeholders), [#22](https://github.com/AbstractNucleus/analytics/issues/22) (browser-side realtime needs an auth path that doesn't leak `BESZEL_API_TOKEN`).

Scope bound: SvelteKit dashboard (`app/`) only. No PocketBase schema or hub-side changes.

---

## Goal

After this ships:

- The fleet view at `/` renders real CPU% / MEM% per row on first paint, instead of `—` placeholders.
- Leaving the tab open shows row metrics updating live (every new sample the hub receives) without a page reload.
- The per-host detail page at `/hosts/[slug]` extends its chart in place as new samples arrive, instead of holding the SSR snapshot static until reload.
- The browser-side bundle does NOT contain a long-lived `BESZEL_API_TOKEN`-shaped string. Realtime auth flows through 5-minute scoped tokens minted on demand by a SvelteKit endpoint.

Done = (a) Manual smoke against production: load `/`, observe non-`—` row values, leave open ≥1 minute, observe ≥ 1 row updating live without reload. (b) Same for a `/hosts/<slug>` page — chart sweep continues. (c) `grep -r BESZEL_API_TOKEN app/.svelte-kit/output/client` returns no hits in the built client bundle. (d) New unit tests cover both bug fixes.

---

## Why

Two known dashboard gaps were filed during the Phase-2 deploy ([#17](https://github.com/AbstractNucleus/analytics/pull/17)–[#20](https://github.com/AbstractNucleus/analytics/pull/20)):

- **Fleet rows show `—`** — the SSR loader fetched systems but `FleetRow.svelte` only reads `latest?.cpuPct`, never the `cpuPct` field that's already on `SystemRow`. Discovery during this design pass: the existing `info` blob on the `systems` collection is auto-maintained by the hub on every agent push, so `system.cpuPct / memPct / diskPct` are already the latest values. The fix is to read from there as the SSR default; no per-system extra query needed (the issue body's "fetch latest stats per system" plan is over-scoped).
- **No live updates** — `subscribeStats` and `subscribeFleet` are implemented in `client.ts` but no `.svelte` page calls them, because they'd 401 against PocketBase's listRule (`@request.auth.id != "" && system.users.id ?= @request.auth.id`) and the only available token (`BESZEL_API_TOKEN`) is too dangerous to ship to the browser.

Both gaps are fixable in one spec: #21 makes the rows have real data to update, and #22 makes that data update.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Browser                                                        │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ +page.svelte  (fleet)                                   │  │
│   │   onMount → startFleetRealtime() → mutates $state       │  │
│   │   FleetRow latest={latestById[id] ?? system.cpuPct}     │  │
│   └────────────────┬────────────────────────────────────────┘  │
│                    │ GET /api/realtime-token (5min JWT)         │
│                    │ then PocketBase SSE via that JWT           │
│                    │ refresh at expiry-30s                      │
└────────────────────┼───────────────────────────────────────────┘
                     │
       ┌─────────────┴────────────────┐
       │ SvelteKit (bserver:3001)     │
       │  /api/realtime-token         │
       │    ↓ Authorization:          │
       │      $BESZEL_API_TOKEN       │
       │    POST /impersonate/<id>    │
       │      duration: 300           │
       └─────────────┬────────────────┘
                     │ same hub URL the SSR client already uses
                     │
       ┌─────────────┴────────────────┐
       │ Beszel hub (bserver:8090)    │
       │  PocketBase                  │
       │   - impersonate              │
       │   - /realtime SSE            │
       │   - listRule on system_stats │
       └──────────────────────────────┘
```

The browser holds only short-lived (5min) tokens it cannot exchange for anything more powerful than what the dashboard server already exposes. The endpoint that mints them has no auth of its own — it relies on the same tailnet trust boundary as the dashboard's GET `/`. (See "Threat model" below.)

---

## Section 1 — Issue #21: Fleet rows show real metrics

### Approach

Drop the per-system "fetch latest stats" plan from the issue body. `SystemRow` already carries `cpuPct`, `memPct`, `diskPct` from the hub's auto-maintained `info` blob — these ARE the latest values the hub has. Make `FleetRow.svelte` use them as the default and treat the `latest?` prop as the realtime override channel.

### Changes

- **`app/src/lib/beszel/types.ts`**: add `lastSeenMs: number` to `SystemRow`.
- **`app/src/lib/beszel/parse.ts`**: `parseSystem` reads `r.updated` via the existing `toMs()` helper (PocketBase auto-tracks `updated` on every record write; the hub bumps it on every agent push).
- **`app/src/lib/panels/FleetRow.svelte`**:
  - `cpu = $derived(deriveMetric(latest?.cpuPct, system))`, same for mem.
  - `deriveMetric` rule: if `latest` is set, use `latest.<metric>`. Else, if the system has been seen (`system.status !== 'pending'` and `lastSeenMs` is finite), use `system.<metric>`. Else, return `NaN` so `formatPercent` renders `—`. This avoids regressing pending / never-reported systems from `—` to `0.0%`.
  - No other prop changes — `lastSeenMs` and `nowMs` props already exist.
- **`app/src/routes/+page.svelte`**: pass `lastSeenMs={system.lastSeenMs} nowMs={Date.now()}` to each `<FleetRow>`. The `nowMs` ticker for "30s ago" freshness is added in Section 2 (one ticker covers both the static SSR and the realtime path).

### Tests

- `app/src/lib/beszel/parse.test.ts`: extend the existing `parseSystem` test to assert `lastSeenMs` parses from `updated`.
- `app/src/lib/panels/FleetRow.test.ts`:
  - Update existing "no `latest`" case to assert `system.cpuPct.toFixed(1)%` shows, not `—`.
  - Add a case where `latest` IS passed and overrides `system.cpuPct` (covers the realtime path used in Section 2).
  - Add a `pending` / never-reported system case that still renders `—`.

### Cost

~20 lines code + tests, ~1 hour.

---

## Section 2 — Issue #22: Browser realtime subscriptions

### A. Token-mint endpoint

**`app/src/routes/api/realtime-token/+server.ts`** (new). GET returns `{ token, expiresAt }`.

Implementation outline:

1. Read `PUBLIC_BESZEL_URL` and `BESZEL_API_TOKEN` from env. 500 if either is missing.
2. Decode the long-lived token's JWT payload (no signature check) to extract `payload.id` — the user-id this token impersonates.
3. POST to `<hub>/api/collections/_superusers/impersonate/<id>` with `Authorization: <BESZEL_API_TOKEN>` and body `{ duration: 300 }`. PocketBase 0.22+ semantics; Beszel 0.18 ships PB 0.22+, verified separately during implementation.
4. Return `{ token: <new-token>, expiresAt: Date.now() + 300_000 }` as JSON.

`expiresAt` is computed locally rather than parsed from the new token's payload — the helper only needs an upper bound for refresh scheduling, and a 30s safety lead handles clock skew.

No request-side auth. Justification in "Threat model" below. A `// TODO(dashboard-auth)` comment marks where a real auth check goes once dashboard login lands.

### B. Client-side realtime helper

**`app/src/lib/beszel/realtime.ts`** (new). One factory function:

```ts
startRealtimeSubscription(baseUrl: string, filter: string | undefined,
                          handler: (sample: StatsSample) => void)
  : Promise<Unsubscribe>
```

Internals:

- Fresh `PocketBase` instance (separate from the SSR client — different authStore lifecycle).
- `pb.autoCancellation(false)` (same reasoning as `client.ts`: the realtime SDK fans out auth-revalidation requests that auto-cancel each other).
- Token bootstrap: `await fetchToken()` → `pb.authStore.save(token)`.
- Subscribe: `pb.collection('system_stats').subscribe('*', cb, filter ? { filter } : {})`.
- Refresh: `setTimeout(refresh, expiresAt - Date.now() - 30_000)` (clamped ≥ 5s). Refresh fetches a new token and re-saves to the same authStore — PocketBase reuses the live SSE connection.
- Reconnect on auth error: PocketBase's realtime client emits errors when the SSE drops with 401 (token expired faster than expected, hub restarted, network dropped). Handler: re-fetch token + re-call `subscribe`. The previous `unsub` returned by the failed subscribe is a no-op at that point.
- Returned unsubscribe: sets `stopped = true`, clears the refresh timer, calls the latest PB unsub.

Two thin wrappers exported from `index.ts`:

```ts
startFleetRealtime(baseUrl, handler)            // no filter
startHostRealtime(baseUrl, systemId, handler)   // filter on systemId
```

### C. Wiring

**`app/src/routes/+page.svelte`** (fleet):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { env as publicEnv } from '$env/dynamic/public';
  import { startFleetRealtime } from '$lib/beszel/realtime';
  import FleetRow from '$lib/panels/FleetRow.svelte';
  import type { StatsSample } from '$lib/beszel';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let latestById: Record<string, StatsSample> = $state({});
  let nowMs = $state(Date.now());

  onMount(() => {
    const tick = setInterval(() => { nowMs = Date.now(); }, 1000);
    let unsub: (() => void) | undefined;
    void startFleetRealtime(publicEnv.PUBLIC_BESZEL_URL ?? '', (sample) => {
      latestById = { ...latestById, [sample.systemId]: sample };
    }).then((u) => { unsub = u; });
    return () => { clearInterval(tick); unsub?.(); };
  });
</script>
```

`<FleetRow>` invocation gets `latest={latestById[system.id]} lastSeenMs={system.lastSeenMs} {nowMs}`.

**`app/src/routes/hosts/[slug]/+page.svelte`** (per-host): mirrors the fleet pattern with `startHostRealtime(baseUrl, data.system.id, ...)`. The handler appends to whatever sample-array structure the chart panel currently consumes (verified during implementation; if the existing panels expect an immutable prop, the page wraps the array in `$state` and re-assigns).

### Removed code

`subscribeStats` / `subscribeFleet` in `app/src/lib/beszel/client.ts` are dead-code today and become incoherent with the new helper (the SSR client doesn't have a way to mint short-lived tokens for itself). Recommend deleting them in this PR. If a server-side use case appears later, it should use a separate factory shaped for the server context.

### Token lifecycle edge cases

- **Tab backgrounded > 5min** → token expires, PB realtime drops with 401. Helper's reconnect path re-fetches and re-subscribes. No user-visible state loss; the chart just doesn't update during the gap.
- **Hub restart** → SSE drops, helper reconnects on next sample push (PB's realtime client retries).
- **Network drop** → same path as hub restart.
- **Component unmount mid-fetch** → `stopped = true` causes `applyToken` to bail before saving the new token or scheduling another refresh.
- **Refresh fetch fails** → log to console, keep current token, retry at half the original lead. Don't tear down the existing subscription — the live token is still valid for ≤ 30s and a transient `/api/realtime-token` failure shouldn't black-hole the page.

### Tests

- **`app/src/routes/api/realtime-token/+server.test.ts`** (new): mocks `fetch` to the hub, verifies the JSON shape, returns 500 on missing env, 502 on hub failure, and that the request body carries `duration: 300`.
- **`app/src/lib/beszel/realtime.test.ts`** (new): mocks `fetch` (token endpoint) and `PocketBase.subscribe`. Verifies token saved before subscribe, subscribe called with `system = '<id>'` filter when `startHostRealtime`, refresh `setTimeout` scheduled with the right delay, unsub clears the timer and the inner unsub.

Existing `app/src/routes/page.test.ts` stays SSR-only. Realtime wiring is unit-tested in the helper; an end-to-end test against a live hub is out of scope for this PR (not currently in the test suite for any feature).

### Cost

~150 lines code + tests, ~3-4 hours.

---

## Threat model

The token-mint endpoint has no per-request auth. This is acceptable for the current deployment because:

- The dashboard URL (`https://analytics.noelkleen.com`) and the Beszel hub (`http://100.124.22.82:8090`) are both reachable only from the tailnet. No public ingress exists.
- A tailnet client that can hit `/api/realtime-token` can also hit the hub's REST API directly with the BESZEL_API_TOKEN target user already exposed in the JWT. Adding endpoint auth wouldn't reduce the attack surface against tailnet-resident threats.
- A cross-origin attacker (e.g., a malicious page in another tab) gains nothing from CSRFing this endpoint: the response token is returned to whatever origin called it, not to the dashboard's localStorage. They could already retrieve metrics by hitting the hub directly from the user's tailnet-attached browser.

If/when dashboard-level auth is introduced, the endpoint should require a valid dashboard session and the spec should be revisited. A `// TODO(dashboard-auth)` comment in the endpoint marks the gate.

The endpoint will not be deployed behind the public internet without a session check — this is enforced socially (the README and decisions doc are clear about tailnet-only) rather than mechanically in this PR.

---

## Files touched

New:
- `app/src/routes/api/realtime-token/+server.ts`
- `app/src/routes/api/realtime-token/+server.test.ts`
- `app/src/lib/beszel/realtime.ts`
- `app/src/lib/beszel/realtime.test.ts`

Modified:
- `app/src/lib/beszel/types.ts` — `SystemRow.lastSeenMs`
- `app/src/lib/beszel/parse.ts` — `parseSystem` reads `updated`
- `app/src/lib/beszel/parse.test.ts` — covers `lastSeenMs`
- `app/src/lib/beszel/index.ts` — re-exports realtime helpers
- `app/src/lib/beszel/client.ts` — removes dead `subscribeStats` / `subscribeFleet`
- `app/src/lib/panels/FleetRow.svelte` — fall back to `system.cpuPct/memPct`
- `app/src/lib/panels/FleetRow.test.ts` — update no-latest case, add latest-overrides case
- `app/src/routes/+page.svelte` — wire fleet realtime, pass new props to `FleetRow`
- `app/src/routes/hosts/[slug]/+page.svelte` — wire host realtime

---

## Out of scope

- Dashboard-level authentication. Filed as a separate concern; #22's auth gating cross-references it.
- Reconnect telemetry / connection-state UI ("reconnecting…" banners). Add if it turns out useful in practice.
- The `host: 192.168.48.1` issue on multi-homed Windows agents (separate concern, not dashboard-side).
- Server-side WebSocket relay (option 2 from #22). Decided against in favor of the lighter token endpoint; revisit if the endpoint approach hits a wall.

---

## Open questions

None blocking. Two implementation-time confirmations:

1. The exact PocketBase impersonate path on Beszel 0.18 — `_superusers` collection vs a different name. Verifiable with one curl to a running hub during implementation.
2. The per-host chart panel's data-input shape — whether it accepts mutations to the existing prop array or wants a fresh `$state`-wrapped array on each tick. Verified by reading the panel during implementation.

Either confirmation, if it surprises us, is a one-line tweak — not a design change.
