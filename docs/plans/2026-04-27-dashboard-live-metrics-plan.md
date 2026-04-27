# Dashboard Live Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard show real per-system CPU/MEM on first paint and update live as new samples arrive, without leaking the long-lived `BESZEL_API_TOKEN` to the browser.

**Architecture:** One PR. Issue #21 ships first as in-place changes to `parse.ts`, `types.ts`, `FleetRow.svelte`, and the fleet `+page.svelte`. Issue #22 then adds a `/api/realtime-token` SvelteKit endpoint that mints 5-minute scoped PocketBase tokens via the impersonate API, plus a `lib/beszel/realtime.ts` helper that owns the token lifecycle (fetch → save → schedule refresh → reconnect on auth drop). The fleet and per-host pages call the helper from `onMount` and mutate `$state` collections so existing components re-render without prop-shape changes.

**Tech Stack:** SvelteKit 2 (runes mode, `adapter-node`), Svelte 5, PocketBase 0.25 SDK, Vitest + `@testing-library/svelte`, jsdom.

**Source spec:** [`docs/specs/2026-04-27-dashboard-live-metrics-design.md`](../specs/2026-04-27-dashboard-live-metrics-design.md).

---

## Ground rules

- **TDD throughout.** Write the failing test, see it fail, write the smallest implementation that makes it pass, see it pass, commit. No skipping the failure step — it catches typo'd paths and "test passes by accident" bugs early.
- **One commit per logical change.** Small, reviewable commits.
- **Run `pnpm test` from `app/` before each commit.** A green run is the gate.
- **No new comments in code unless they explain non-obvious WHY.** `// TODO(dashboard-auth)` is the one allowed exception in this PR — it marks the place a future auth check goes.
- **All PocketBase URLs come from `data.beszelUrl`** (already plumbed via `app/src/routes/+layout.server.ts`). Do not import `$env/dynamic/public` inside `.svelte` files — keep that boundary at the loader.
- **All steps run from `app/`** unless otherwise specified.

---

## Concerns overview

| # | Concern | Owns | Depends on |
|---|---------|------|------------|
| 1 | Plumb `lastSeenMs` into `SystemRow` | `types.ts`, `parse.ts`, `parse.test.ts` | — |
| 2 | Fleet rows render real metrics (#21) | `FleetRow.svelte`, `FleetRow.test.ts`, `+page.svelte` | Concern 1 |
| 3 | Token-mint endpoint | `routes/api/realtime-token/+server.ts` + test | — |
| 4 | Client-side realtime helper | `lib/beszel/realtime.ts` + test, `lib/beszel/index.ts` | Concern 3 |
| 5 | Remove dead `subscribeStats` / `subscribeFleet` | `lib/beszel/client.ts`, `client.test.ts` | Concern 4 |
| 6 | Wire fleet realtime (#22) | `routes/+page.svelte`, `page.test.ts` | Concerns 2, 4 |
| 7 | Wire per-host realtime (#22) | `routes/hosts/[slug]/+page.svelte`, `routes/hosts/[slug]/page.test.ts` | Concern 4 |
| 8 | Manual verification + PR | — | Concerns 1–7 |

Topological order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

---

# Concern 1: Plumb `lastSeenMs` into `SystemRow`

**Branch:** `feat/dashboard-live-metrics`
**Outcome:** `SystemRow.lastSeenMs: number` is parsed from PocketBase's auto-tracked `updated` field, so callers can show "Nm ago" without an extra query.

### Task 1.1: Branch from main

**Files:** none (git only).

- [ ] **Step 1.1.1: Create the branch.**

```bash
git fetch origin
git checkout -B feat/dashboard-live-metrics origin/main
```

Expected: branch exists, working tree clean, HEAD at `origin/main`.

- [ ] **Step 1.1.2: Verify clean state.**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

---

### Task 1.2: Add `lastSeenMs` to `SystemRow` type

**Files:**
- Modify: `app/src/lib/beszel/types.ts`

- [ ] **Step 1.2.1: Edit the type.**

Open `app/src/lib/beszel/types.ts`. After the `bootTimeOffset` field on `SystemRow` (currently the last field), add:

```ts
  /**
   * Wall-clock timestamp (ms since epoch) of the most recent agent push the
   * hub has seen for this system. Sourced from PocketBase's auto-tracked
   * `updated` column on the `systems` row.
   */
  lastSeenMs: number;
```

- [ ] **Step 1.2.2: Type check.**

```bash
cd app && pnpm check
```

Expected: errors in `parse.ts` and any test that constructs a `SystemRow` literal — those are addressed in the next tasks. The errors confirm the new field is required.

- [ ] **Step 1.2.3: Commit.**

```bash
cd app && git add src/lib/beszel/types.ts
git commit -m "feat(types): add SystemRow.lastSeenMs"
```

---

### Task 1.3: Failing test for `parseSystem` lastSeenMs

**Files:**
- Modify: `app/src/lib/beszel/parse.test.ts`

- [ ] **Step 1.3.1: Add the failing test.**

In `app/src/lib/beszel/parse.test.ts`, inside the `describe('parseSystem', ...)` block, add this `it` after the existing "maps a raw systems record" test:

```ts
  it('parses lastSeenMs from the `updated` PocketBase column', () => {
    const updatedAt = '2026-04-24 12:00:00.000Z';
    const row = parseSystem({ ...rawSystem, updated: updatedAt });
    expect(row.lastSeenMs).toBe(new Date(updatedAt.replace(' ', 'T')).getTime());
  });

  it('returns NaN for lastSeenMs when `updated` is missing', () => {
    const { updated, ...withoutUpdated } = rawSystem as Record<string, unknown>;
    const row = parseSystem(withoutUpdated);
    expect(Number.isNaN(row.lastSeenMs)).toBe(true);
  });
```

Also extend the existing `expect(row).toEqual({...})` block to include `lastSeenMs` so the exhaustive shape check still passes:

```ts
    expect(row).toEqual({
      // ...all existing fields...
      bootTimeOffset: rawSystemInfo.bb,
      lastSeenMs: new Date(String(rawSystem.updated).replace(' ', 'T')).getTime(),
    });
```

(If the existing fixture's top-level `rawSystem.updated` is undefined, the existing exhaustive test will already fail with the new required field — that's expected. The two new `it` blocks specifically cover the present-and-missing cases.)

- [ ] **Step 1.3.2: Run the tests; expect failure.**

```bash
cd app && pnpm test src/lib/beszel/parse.test.ts
```

Expected: 2 new `parseSystem` tests fail with "expected NaN to be ..." or "expected object to deeply equal ...". This confirms `parseSystem` doesn't yet emit `lastSeenMs`.

---

### Task 1.4: Make `parseSystem` emit `lastSeenMs`

**Files:**
- Modify: `app/src/lib/beszel/parse.ts`

- [ ] **Step 1.4.1: Implement.**

In `app/src/lib/beszel/parse.ts`, inside `parseSystem`'s returned object, add `lastSeenMs` as the last field:

```ts
    bootTimeOffset: num(info.bb),
    lastSeenMs: toMs(r.updated),
```

`toMs` is already defined in this file and returns `NaN` when the input isn't a string — that matches the failing-case test in Task 1.3.

- [ ] **Step 1.4.2: Run the tests; expect pass.**

```bash
cd app && pnpm test src/lib/beszel/parse.test.ts
```

Expected: all `parseSystem` tests pass, including the two new ones.

- [ ] **Step 1.4.3: Run the full test suite.**

```bash
cd app && pnpm test
```

Expected: all tests pass. (`page.test.ts` and `FleetRow.test.ts` use `parseSystem(systemsFixture[0])` so they automatically pick up the new `lastSeenMs` value.)

- [ ] **Step 1.4.4: Type check.**

```bash
cd app && pnpm check
```

Expected: no errors.

- [ ] **Step 1.4.5: Commit.**

```bash
cd app && git add src/lib/beszel/parse.ts src/lib/beszel/parse.test.ts
git commit -m "feat(parse): emit SystemRow.lastSeenMs from \`updated\`"
```

---

# Concern 2: Fleet rows render real metrics

**Outcome:** `/` shows real CPU% / MEM% per row on first paint, and "N ago" reflects `lastSeenMs`.

### Task 2.1: Failing tests for `FleetRow` metric fallback

**Files:**
- Modify: `app/src/lib/panels/FleetRow.test.ts`

- [ ] **Step 2.1.1: Replace the existing "no `latest`" case and add two new cases.**

In `app/src/lib/panels/FleetRow.test.ts`, replace the second `it` block (`renders em-dashes when no latest stat is available`) with these three blocks:

```ts
  it('falls back to system.cpuPct/memPct when latest is not provided', () => {
    render(FleetRow, { props: { system: SYSTEM } });
    expect(screen.getByText(SYSTEM.name)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${SYSTEM.cpuPct.toFixed(1)}%`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${SYSTEM.memPct.toFixed(1)}%`))).toBeInTheDocument();
  });

  it('uses latest sample when both latest and system metrics are present', () => {
    // Build a sample whose values clearly differ from the system's static info.
    const overriding: typeof LATEST = { ...LATEST, cpuPct: 88.5, memPct: 12.5 };
    render(FleetRow, { props: { system: SYSTEM, latest: overriding } });
    expect(screen.getByText(/88\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/12\.5%/)).toBeInTheDocument();
  });

  it('renders em-dashes for a pending system that has never reported', () => {
    const pending: typeof SYSTEM = {
      ...SYSTEM,
      status: 'pending',
      cpuPct: 0,
      memPct: 0,
      lastSeenMs: NaN,
    };
    render(FleetRow, { props: { system: pending } });
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2.1.2: Run the tests; expect failure.**

```bash
cd app && pnpm test src/lib/panels/FleetRow.test.ts
```

Expected: the "falls back" and "uses latest sample" tests fail because `FleetRow` currently always reads `latest?.cpuPct ?? NaN`, which becomes `—` when latest is absent and ignores `system.cpuPct`.

---

### Task 2.2: Implement metric fallback in `FleetRow.svelte`

**Files:**
- Modify: `app/src/lib/panels/FleetRow.svelte`

- [ ] **Step 2.2.1: Replace the `cpu` and `mem` derivations.**

In `app/src/lib/panels/FleetRow.svelte`, replace lines 13-16 (the `const { system, ... } = $props()` block and the two `$derived` lines) with:

```svelte
  const { system, latest, lastSeenMs, nowMs }: Props = $props();

  function metric(override: number | undefined, fallback: number): number {
    if (override !== undefined) return override;
    if (system.status === 'pending') return NaN;
    if (!Number.isFinite(system.lastSeenMs)) return NaN;
    return fallback;
  }

  const cpu = $derived(metric(latest?.cpuPct, system.cpuPct));
  const mem = $derived(metric(latest?.memPct, system.memPct));
```

- [ ] **Step 2.2.2: Run the tests; expect pass.**

```bash
cd app && pnpm test src/lib/panels/FleetRow.test.ts
```

Expected: all 4 `FleetRow` tests pass.

- [ ] **Step 2.2.3: Type check.**

```bash
cd app && pnpm check
```

Expected: no errors.

- [ ] **Step 2.2.4: Commit.**

```bash
cd app && git add src/lib/panels/FleetRow.svelte src/lib/panels/FleetRow.test.ts
git commit -m "fix(fleet-row): read CPU/MEM from SystemRow when latest is absent (#21)"
```

---

### Task 2.3: Pass `lastSeenMs` and a ticking `nowMs` from the fleet page

**Files:**
- Modify: `app/src/routes/+page.svelte`

- [ ] **Step 2.3.1: Add the ticker and prop wiring.**

Replace the entire `<script lang="ts">` block in `app/src/routes/+page.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import FleetRow from '$lib/panels/FleetRow.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Tick at 1s so "30s ago" stays current. A second-resolution clock is fine
  // for relative timestamps; sub-second updates would over-render.
  let nowMs = $state(Date.now());
  onMount(() => {
    const tick = setInterval(() => { nowMs = Date.now(); }, 1000);
    return () => clearInterval(tick);
  });
</script>
```

Then update the `<FleetRow>` invocation in the template:

```svelte
      <FleetRow {system} lastSeenMs={system.lastSeenMs} {nowMs} />
```

- [ ] **Step 2.3.2: Run the tests.**

```bash
cd app && pnpm test src/routes/page.test.ts
```

Expected: pass. The existing test only asserts row count and slug attributes; it doesn't assert on prop values, so it's still green.

- [ ] **Step 2.3.3: Type check.**

```bash
cd app && pnpm check
```

Expected: no errors.

- [ ] **Step 2.3.4: Commit.**

```bash
cd app && git add src/routes/+page.svelte
git commit -m "fix(fleet): pass lastSeenMs and ticking nowMs to FleetRow (#21)"
```

---

# Concern 3: Token-mint endpoint

**Outcome:** `GET /api/realtime-token` returns `{ token, expiresAt }` JSON, minted via PocketBase's impersonate API.

### Task 3.1: Failing test for the endpoint

**Files:**
- Create: `app/src/routes/api/realtime-token/server.test.ts`

(Note: the conventional vitest filename for a `+server.ts` is `server.test.ts` — the `+` is treated as a route marker by SvelteKit and a literal by vitest, but importing `./+server` from `./server.test.ts` works either way. We use `server.test.ts` for clarity.)

- [ ] **Step 3.1.1: Create the directory.**

```bash
mkdir -p app/src/routes/api/realtime-token
```

- [ ] **Step 3.1.2: Write the failing test.**

Create `app/src/routes/api/realtime-token/server.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublicEnv = vi.hoisted(() => ({ PUBLIC_BESZEL_URL: '' }));
const mockPrivateEnv = vi.hoisted(() => ({ BESZEL_API_TOKEN: '' }));

vi.mock('$env/dynamic/public', () => ({ env: mockPublicEnv }));
vi.mock('$env/dynamic/private', () => ({ env: mockPrivateEnv }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// JWT payload encodes a user-id we can read back without verification: matches
// the shape Beszel emits (collection `users`, role-bearing user record).
const TEST_USER_ID = 'zo4rbhzczqmndu2';
const TEST_JWT = (() => {
  const payload = { collectionId: '_pb_users_auth_', id: TEST_USER_ID, type: 'auth' };
  const b64 = (s: string) =>
    Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(payload))}.sig`;
})();

import { GET } from './+server';

function makeRequestEvent(): Parameters<typeof GET>[0] {
  // The endpoint doesn't read anything off the event; cast a minimal shape.
  return {} as Parameters<typeof GET>[0];
}

beforeEach(() => {
  fetchMock.mockReset();
  mockPublicEnv.PUBLIC_BESZEL_URL = 'http://hub.example:8090';
  mockPrivateEnv.BESZEL_API_TOKEN = TEST_JWT;
});

describe('GET /api/realtime-token', () => {
  it('mints a 5-minute token via PocketBase impersonate and returns it', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'short-lived-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const before = Date.now();
    const res = await GET(makeRequestEvent());
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };
    expect(body.token).toBe('short-lived-token');
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 5 * 60 * 1000);
    expect(body.expiresAt).toBeLessThanOrEqual(after + 5 * 60 * 1000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`http://hub.example:8090/api/collections/users/impersonate/${TEST_USER_ID}`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe(TEST_JWT);
    expect(JSON.parse(init?.body as string)).toEqual({ duration: 300 });
  });

  it('returns 500 when PUBLIC_BESZEL_URL is missing', async () => {
    mockPublicEnv.PUBLIC_BESZEL_URL = '';
    await expect(GET(makeRequestEvent())).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 500 when BESZEL_API_TOKEN is missing', async () => {
    mockPrivateEnv.BESZEL_API_TOKEN = '';
    await expect(GET(makeRequestEvent())).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the API token is malformed', async () => {
    mockPrivateEnv.BESZEL_API_TOKEN = 'not.a.jwt.with.too.many.dots';
    await expect(GET(makeRequestEvent())).rejects.toMatchObject({ status: 500 });
  });

  it('returns 502 when the hub rejects the impersonate request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    await expect(GET(makeRequestEvent())).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 3.1.3: Run the test; expect failure.**

```bash
cd app && pnpm test src/routes/api/realtime-token/server.test.ts
```

Expected: failure with "Cannot find module './+server'" or similar — the endpoint file doesn't exist yet.

---

### Task 3.2: Implement the endpoint

**Files:**
- Create: `app/src/routes/api/realtime-token/+server.ts`

- [ ] **Step 3.2.1: Write the endpoint.**

Create `app/src/routes/api/realtime-token/+server.ts`:

```ts
import { error, json } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const TOKEN_DURATION_S = 300;

// TODO(dashboard-auth): when dashboard login lands, gate this endpoint on a
// valid session before minting a hub token. Until then, the trust boundary is
// tailnet access — same as the rest of the dashboard.
export const GET: RequestHandler = async () => {
  const baseUrl = publicEnv.PUBLIC_BESZEL_URL;
  const apiToken = privateEnv.BESZEL_API_TOKEN;
  if (!baseUrl) throw error(500, 'PUBLIC_BESZEL_URL is not configured');
  if (!apiToken) throw error(500, 'BESZEL_API_TOKEN is not configured');

  const userId = decodeImpersonatedUserId(apiToken);
  if (!userId) throw error(500, 'BESZEL_API_TOKEN is malformed');

  const url = new URL(`/api/collections/users/impersonate/${userId}`, baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: apiToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: TOKEN_DURATION_S }),
  });
  if (!res.ok) throw error(502, `hub impersonate failed: HTTP ${res.status}`);
  const body = (await res.json()) as { token: string };

  return json({ token: body.token, expiresAt: Date.now() + TOKEN_DURATION_S * 1000 });
};

function decodeImpersonatedUserId(jwt: string): string | undefined {
  const parts = jwt.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const payload = JSON.parse(json) as { id?: unknown };
    return typeof payload.id === 'string' ? payload.id : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 3.2.2: Run the test; expect pass.**

```bash
cd app && pnpm test src/routes/api/realtime-token/server.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 3.2.3: Run the full test suite + typecheck.**

```bash
cd app && pnpm test && pnpm check
```

Expected: green.

- [ ] **Step 3.2.4: Commit.**

```bash
cd app && git add src/routes/api/realtime-token/
git commit -m "feat(api): add realtime-token endpoint that mints 5-min PB tokens (#22)"
```

---

# Concern 4: Client-side realtime helper

**Outcome:** `lib/beszel/realtime.ts` exposes `startFleetRealtime` and `startHostRealtime` that handle token lifecycle + reconnect.

### Task 4.1: Failing test for the realtime helper

**Files:**
- Create: `app/src/lib/beszel/realtime.test.ts`

- [ ] **Step 4.1.1: Write the failing test.**

Create `app/src/lib/beszel/realtime.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import realtimeEventFixture from '../../../tests/fixtures/realtime-event.json';

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const authStoreSaveSpy = vi.fn();
const autoCancellationSpy = vi.fn();
const collectionSpy = vi.fn();

vi.mock('pocketbase', () => {
  const PocketBase = vi.fn().mockImplementation(function MockPB(this: unknown) {
    Object.assign(this as object, {
      authStore: { save: authStoreSaveSpy },
      collection: collectionSpy,
      autoCancellation: autoCancellationSpy,
    });
  });
  return { default: PocketBase };
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { startFleetRealtime, startHostRealtime } from './realtime';

function tokenResponse(token: string, ttlMs: number) {
  return new Response(JSON.stringify({ token, expiresAt: Date.now() + ttlMs }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  subscribeMock.mockReset().mockResolvedValue(unsubscribeMock);
  unsubscribeMock.mockReset();
  authStoreSaveSpy.mockReset();
  autoCancellationSpy.mockReset();
  collectionSpy.mockReset().mockImplementation(() => ({ subscribe: subscribeMock }));
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startFleetRealtime', () => {
  it('fetches a token, saves it, and subscribes to system_stats with no filter', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('tok1', 300_000));

    const handler = vi.fn();
    const unsub = await startFleetRealtime('http://hub.example:8090', handler);

    expect(fetchMock).toHaveBeenCalledWith('/api/realtime-token');
    expect(autoCancellationSpy).toHaveBeenCalledWith(false);
    expect(authStoreSaveSpy).toHaveBeenCalledWith('tok1');
    expect(collectionSpy).toHaveBeenCalledWith('system_stats');
    expect(subscribeMock).toHaveBeenCalled();
    const [topic, , opts] = subscribeMock.mock.calls[0];
    expect(topic).toBe('*');
    expect(opts).toBeUndefined();

    expect(typeof unsub).toBe('function');
  });

  it('forwards parsed StatsSamples to the handler', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('tok1', 300_000));
    const handler = vi.fn();
    await startFleetRealtime('http://hub.example:8090', handler);

    const [, cb] = subscribeMock.mock.calls[0];
    cb({ action: 'create', record: realtimeEventFixture.record });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      systemId: realtimeEventFixture.record.system,
    });
  });

  it('schedules a refresh 30s before expiry and re-saves the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('tok1', 300_000))
      .mockResolvedValueOnce(tokenResponse('tok2', 300_000));

    await startFleetRealtime('http://hub.example:8090', vi.fn());

    expect(authStoreSaveSpy).toHaveBeenCalledTimes(1);

    // 30s lead means refresh fires at 270_000ms.
    await vi.advanceTimersByTimeAsync(269_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    // Refresh fetch + the resolved promise need a microtask flush.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authStoreSaveSpy).toHaveBeenLastCalledWith('tok2');
  });

  it('unsubscribe clears the refresh timer and calls the inner unsub', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('tok1', 300_000));

    const unsub = await startFleetRealtime('http://hub.example:8090', vi.fn());
    unsub();

    expect(unsubscribeMock).toHaveBeenCalled();
    // After unsub, the refresh timer should not fire — advancing past expiry
    // should leave fetch call count unchanged.
    await vi.advanceTimersByTimeAsync(400_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('startHostRealtime', () => {
  it('subscribes with a system filter when given a systemId', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('tok1', 300_000));

    await startHostRealtime('http://hub.example:8090', 'sys123', vi.fn());

    const [, , opts] = subscribeMock.mock.calls[0];
    expect(opts?.filter).toBe(`system = 'sys123'`);
  });
});
```

- [ ] **Step 4.1.2: Run the test; expect failure.**

```bash
cd app && pnpm test src/lib/beszel/realtime.test.ts
```

Expected: failure with "Cannot find module './realtime'".

---

### Task 4.2: Implement the realtime helper

**Files:**
- Create: `app/src/lib/beszel/realtime.ts`

- [ ] **Step 4.2.1: Write the helper.**

Create `app/src/lib/beszel/realtime.ts`:

```ts
import PocketBase from 'pocketbase';
import { parseStatsSample } from './parse';
import type { StatsSample, Unsubscribe } from './types';

const REFRESH_LEAD_MS = 30_000;
const MIN_REFRESH_DELAY_MS = 5_000;

interface TokenResponse {
  token: string;
  expiresAt: number;
}

async function fetchToken(): Promise<TokenResponse> {
  const res = await fetch('/api/realtime-token');
  if (!res.ok) throw new Error(`realtime-token: HTTP ${res.status}`);
  return (await res.json()) as TokenResponse;
}

function escapeFilterValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

export async function startRealtimeSubscription(
  baseUrl: string,
  filter: string | undefined,
  handler: (sample: StatsSample) => void,
): Promise<Unsubscribe> {
  const pb = new PocketBase(baseUrl);
  pb.autoCancellation(false);

  let stopped = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  async function applyTokenAndSchedule() {
    const { token, expiresAt } = await fetchToken();
    if (stopped) return;
    pb.authStore.save(token);
    const delay = Math.max(expiresAt - Date.now() - REFRESH_LEAD_MS, MIN_REFRESH_DELAY_MS);
    refreshTimer = setTimeout(() => {
      void applyTokenAndSchedule().catch((err) => console.warn('realtime token refresh failed:', err));
    }, delay);
  }

  await applyTokenAndSchedule();

  const subOpts = filter ? { filter } : undefined;
  const innerUnsub = await pb
    .collection('system_stats')
    .subscribe('*', (data: { record: unknown }) => handler(parseStatsSample(data.record)), subOpts);

  return () => {
    stopped = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    void innerUnsub();
  };
}

export function startFleetRealtime(
  baseUrl: string,
  handler: (sample: StatsSample) => void,
): Promise<Unsubscribe> {
  return startRealtimeSubscription(baseUrl, undefined, handler);
}

export function startHostRealtime(
  baseUrl: string,
  systemId: string,
  handler: (sample: StatsSample) => void,
): Promise<Unsubscribe> {
  return startRealtimeSubscription(baseUrl, `system = '${escapeFilterValue(systemId)}'`, handler);
}
```

- [ ] **Step 4.2.2: Run the test; expect pass.**

```bash
cd app && pnpm test src/lib/beszel/realtime.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 4.2.3: Re-export from `index.ts`.**

In `app/src/lib/beszel/index.ts`, add:

```ts
export {
  startFleetRealtime,
  startHostRealtime,
  startRealtimeSubscription,
} from './realtime';
```

- [ ] **Step 4.2.4: Run the full suite + typecheck.**

```bash
cd app && pnpm test && pnpm check
```

Expected: green.

- [ ] **Step 4.2.5: Commit.**

```bash
cd app && git add src/lib/beszel/realtime.ts src/lib/beszel/realtime.test.ts src/lib/beszel/index.ts
git commit -m "feat(realtime): add browser-side helper with short-lived token lifecycle (#22)"
```

---

# Concern 5: Remove dead `subscribeStats` / `subscribeFleet`

**Outcome:** the old SSR-time subscribe methods are gone; nothing references them.

### Task 5.1: Remove from `client.ts` and `client.test.ts`

**Files:**
- Modify: `app/src/lib/beszel/client.ts`
- Modify: `app/src/lib/beszel/client.test.ts`

- [ ] **Step 5.1.1: Confirm no other callers.**

```bash
cd app && pnpm exec grep -rn "subscribeStats\|subscribeFleet" src/ tests/ 2>&1 | grep -v ":\s*//\s*"
```

Expected: only `client.ts` and `client.test.ts` show up. (If any `.svelte` shows up, stop and investigate — the spec assumed they were dead.)

- [ ] **Step 5.1.2: Remove from `client.ts`.**

In `app/src/lib/beszel/client.ts`:

1. Remove `subscribeStats` and `subscribeFleet` from the `BeszelClient` interface (lines 27–28 in current source).
2. Remove the two function definitions (`async function subscribeStats(...)` and `async function subscribeFleet(...)`).
3. Remove `subscribeStats` and `subscribeFleet` from the `return { ... }` literal.

- [ ] **Step 5.1.3: Remove from `client.test.ts`.**

In `app/src/lib/beszel/client.test.ts`:

1. Remove the two `describe('subscribeStats', ...)` and `describe('subscribeFleet', ...)` blocks.
2. Remove `expect(typeof client.subscribeStats).toBe('function');` and the `subscribeFleet` line from the "returns the documented client surface" test.
3. Remove `subscribeSpy` and `unsubscribeMock` from `resetSpies` — they're no longer touched here. The realtime helper's tests own those concerns now.
4. Remove the `subscribe: subscribeSpy` line from the `collectionSpy.mockImplementation` block.
5. Remove the `realtimeEventFixture` import.

- [ ] **Step 5.1.4: Run the full suite + typecheck.**

```bash
cd app && pnpm test && pnpm check
```

Expected: green. The realtime helper tests still pass (they have their own mocks).

- [ ] **Step 5.1.5: Commit.**

```bash
cd app && git add src/lib/beszel/client.ts src/lib/beszel/client.test.ts
git commit -m "refactor(client): remove unused subscribeStats/subscribeFleet"
```

---

# Concern 6: Wire fleet realtime

**Outcome:** the fleet view's rows update live when new samples arrive.

### Task 6.1: Wire realtime into `+page.svelte`

**Files:**
- Modify: `app/src/routes/+page.svelte`

- [ ] **Step 6.1.1: Add the realtime path.**

Replace the `<script lang="ts">` block in `app/src/routes/+page.svelte` (just modified in Task 2.3) with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import FleetRow from '$lib/panels/FleetRow.svelte';
  import { startFleetRealtime } from '$lib/beszel';
  import type { StatsSample } from '$lib/beszel';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Realtime samples keyed by system id. FleetRow falls back to system.cpuPct
  // when the entry is undefined, so the SSR snapshot still drives first paint.
  let latestById: Record<string, StatsSample> = $state({});

  // Tick at 1s so "30s ago" stays current.
  let nowMs = $state(Date.now());

  onMount(() => {
    const tick = setInterval(() => { nowMs = Date.now(); }, 1000);
    let unsubRealtime: (() => void) | undefined;
    void startFleetRealtime(data.beszelUrl ?? '', (sample) => {
      latestById = { ...latestById, [sample.systemId]: sample };
    }).then((u) => { unsubRealtime = u; });
    return () => {
      clearInterval(tick);
      unsubRealtime?.();
    };
  });
</script>
```

Update the `<FleetRow>` invocation:

```svelte
      <FleetRow
        {system}
        latest={latestById[system.id]}
        lastSeenMs={system.lastSeenMs}
        {nowMs}
      />
```

- [ ] **Step 6.1.2: Run the page test.**

```bash
cd app && pnpm test src/routes/page.test.ts
```

Expected: pass. `onMount` is a no-op under jsdom unless explicitly invoked, and the existing test only inspects the rendered DOM after a synchronous `render()`. The realtime path is exercised only on real browsers.

- [ ] **Step 6.1.3: Run the full suite + typecheck.**

```bash
cd app && pnpm test && pnpm check
```

Expected: green.

- [ ] **Step 6.1.4: Commit.**

```bash
cd app && git add src/routes/+page.svelte
git commit -m "feat(fleet): wire realtime row updates via short-lived hub token (#22)"
```

---

# Concern 7: Wire per-host realtime

**Outcome:** the per-host page extends its chart in place as new samples arrive.

### Task 7.1: Read the existing per-host wiring to confirm panel shape

- [ ] **Step 7.1.1: Verify the chart panels accept a samples array.**

```bash
cd app && pnpm exec grep -n "samples=\|samples:" src/routes/hosts/[slug]/+page.svelte src/lib/panels/CpuPanel.svelte src/lib/panels/NetworkPanel.svelte
```

Expected: `+page.svelte` passes `samples={data.samples}` to CpuPanel and NetworkPanel; both panels accept a `samples` prop. (Confirmed in spec — this step is a sanity check, not a change.)

---

### Task 7.2: Wire realtime into the per-host page

**Files:**
- Modify: `app/src/routes/hosts/[slug]/+page.svelte`

- [ ] **Step 7.2.1: Replace the `<script lang="ts">` block.**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import HostHeader from '$lib/panels/HostHeader.svelte';
  import CpuPanel from '$lib/panels/CpuPanel.svelte';
  import MemoryPanel from '$lib/panels/MemoryPanel.svelte';
  import DiskPanel from '$lib/panels/DiskPanel.svelte';
  import NetworkPanel from '$lib/panels/NetworkPanel.svelte';
  import UptimeKernel from '$lib/panels/UptimeKernel.svelte';
  import { startHostRealtime } from '$lib/beszel';
  import type { StatsSample } from '$lib/beszel';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Mutable samples array seeded from SSR; realtime appends.
  let samples: StatsSample[] = $state(data.samples);
  const latest = $derived(samples.length > 0 ? samples[samples.length - 1] : undefined);

  onMount(() => {
    let unsub: (() => void) | undefined;
    void startHostRealtime(data.beszelUrl ?? '', data.system.id, (sample) => {
      samples = [...samples, sample];
    }).then((u) => { unsub = u; });
    return () => { unsub?.(); };
  });
</script>
```

Update the panel invocations to read `samples` (the local `$state` variable, not `data.samples`):

```svelte
<HostHeader system={data.system} lastSeenMs={latest?.timestamp} />

<div class="stack">
  <CpuPanel {samples} currentPct={latest?.cpuPct} />
  <MemoryPanel currentPct={latest?.memPct} memoryBytes={data.systemDetails.memoryBytes} />
  <DiskPanel currentPct={latest?.diskPct} diskTotalGb={latest?.diskTotalGb} />
  <NetworkPanel
    {samples}
    currentReadBps={latest?.netRecvBps}
    currentSentBps={latest?.netSentBps}
  />
  <UptimeKernel
    uptimeSeconds={data.system.uptimeSeconds}
    kernel={data.systemDetails.kernel}
    osName={data.systemDetails.osName}
  />
</div>
```

- [ ] **Step 7.2.2: Run the per-host page test.**

```bash
cd app && pnpm test src/routes/hosts/[slug]/page.test.ts
```

Expected: pass. As with the fleet test, `onMount` is inert under jsdom rendering.

- [ ] **Step 7.2.3: Run the full suite + typecheck.**

```bash
cd app && pnpm test && pnpm check
```

Expected: green.

- [ ] **Step 7.2.4: Commit.**

```bash
cd app && git add src/routes/hosts/[slug]/+page.svelte
git commit -m "feat(host): wire realtime sample appends via short-lived hub token (#22)"
```

---

# Concern 8: Manual verification + PR

**Outcome:** the change is verified against the production hub on a developer dev server, and a PR is opened.

### Task 8.1: Local dev-server smoke

**Files:** none (verification only).

- [ ] **Step 8.1.1: Start the dev server with the production hub.**

The dev server reads `app/.env.local` if present; fall back to one-shot env vars otherwise. The `BESZEL_API_TOKEN` for kleen-pc dev is at `/c/Users/noelh/AppData/Local/Temp/beszel_api_token`.

```bash
cd app && PUBLIC_BESZEL_URL=http://100.124.22.82:8090 \
  BESZEL_API_TOKEN="$(cat /c/Users/noelh/AppData/Local/Temp/beszel_api_token)" \
  pnpm dev --host 127.0.0.1 --port 5173
```

Expected: dev server running at http://127.0.0.1:5173/.

- [ ] **Step 8.1.2: Verify fleet rows show real values (#21).**

Open http://127.0.0.1:5173/ in a browser. Each row should show non-`—` CPU% and MEM% values matching what the hub reports for that system. Compare against:

```bash
TOKEN=$(cat /c/Users/noelh/AppData/Local/Temp/beszel_api_token)
curl -sS -H "Authorization: $TOKEN" http://100.124.22.82:8090/api/collections/systems/records | python -m json.tool | grep -E '"name"|"cpu"|"mp"'
```

Expected: page values match the API's `info.cpu` and `info.mp`.

- [ ] **Step 8.1.3: Verify realtime updates (#22).**

Leave the page open for ≥ 90 seconds (Beszel's default rollup is 60 s). Watch one of the row CPU values — it should update without a reload. Open the browser devtools network tab; you should see:

- A single `GET /api/realtime-token` returning `{ token, expiresAt }`.
- A SSE connection to `http://100.124.22.82:8090/api/realtime` that stays open.
- No request carrying the long-lived `BESZEL_API_TOKEN` (verify by searching the network panel for the token's first 16 chars).

- [ ] **Step 8.1.4: Verify per-host realtime.**

Click into a host row. The chart should keep extending forward as new samples arrive. Specifically: note the right-most data point's x-axis time, wait 90 s, refresh the chart visually — the right edge should have advanced without a page reload.

- [ ] **Step 8.1.5: Verify the bundle does not contain `BESZEL_API_TOKEN`.**

```bash
cd app && pnpm build
grep -r "$(cat /c/Users/noelh/AppData/Local/Temp/beszel_api_token | cut -c1-32)" .svelte-kit/output/client 2>&1 || echo "not present in client bundle"
```

Expected: `not present in client bundle`. (The SSR server bundle WILL contain it — that's intended.)

- [ ] **Step 8.1.6: Stop the dev server.**

`Ctrl-C` in the terminal running `pnpm dev`.

---

### Task 8.2: Open the PR

- [ ] **Step 8.2.1: Push the branch.**

```bash
git push -u origin feat/dashboard-live-metrics
```

- [ ] **Step 8.2.2: Open the PR.**

```bash
gh pr create --repo AbstractNucleus/analytics --base main --head feat/dashboard-live-metrics \
  --title "feat(dashboard): live metrics — fleet rows + browser realtime (#21, #22)" \
  --body "$(cat <<'EOF'
## Summary
Closes #21 and #22.

- #21: FleetRow falls back to SystemRow.cpuPct/memPct (the hub's `info` blob is auto-maintained on every agent push, so these are already the latest values). New `lastSeenMs` field on SystemRow drives the "N ago" label. Pending / never-reported systems still render `—`.
- #22: New `/api/realtime-token` endpoint mints 5-minute scoped PocketBase tokens via the impersonate API. New `lib/beszel/realtime.ts` helper handles token lifecycle (fetch → save → refresh 30s before expiry). Fleet view subscribes to all `system_stats`; per-host view filters by system id. Browser bundle never carries the long-lived BESZEL_API_TOKEN.

Removed: dead `subscribeStats` / `subscribeFleet` methods on `BeszelClient` (no callers, incoherent with the new browser-side helper).

## Test plan
- [ ] `pnpm test` and `pnpm check` pass in `app/`
- [ ] Dev server against the prod hub: fleet rows show real CPU% / MEM% on first load
- [ ] Leave the page open ≥ 90s — at least one row metric updates without a reload
- [ ] Per-host page: chart extends forward without a page reload
- [ ] `grep` of the built client bundle does not contain BESZEL_API_TOKEN

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Self-review

Spec coverage:

- §Section 1 (#21) — covered by Concerns 1, 2.
- §Section 2.A (token endpoint) — Concern 3.
- §Section 2.B (realtime helper) — Concern 4.
- §Section 2.C (wiring) — Concerns 6, 7.
- §"Removed code" — Concern 5.
- §"Token lifecycle edge cases" — covered in Task 4.2 implementation (refresh timer, `stopped` flag, console.warn on refresh failure). Reconnect-on-auth-error is implemented as side-effect of refresh-then-PocketBase-resubscribes; if the SSE stream drops independently of a 401, PB's own retry handles it. **Open implementation question:** if PB's SSE drops with auth error, does the refresh timer alone re-establish the subscription? If not, add a one-shot `subscribe` re-call in the `applyTokenAndSchedule` success branch — verifiable by simulating an auth error in the realtime test. The current task list does not include that test; add it inline if needed during Task 4.2.
- §"Threat model" — embedded as `// TODO(dashboard-auth)` comment in Task 3.2.
- §"Files touched" — every file in the spec's list appears in at least one task.

Type consistency: helper exports `startFleetRealtime`, `startHostRealtime`, `startRealtimeSubscription`. Fleet wiring (Task 6.1) uses `startFleetRealtime`. Per-host wiring (Task 7.2) uses `startHostRealtime`. `Unsubscribe` type comes from `./types` and is the same shape as the existing one. ✓

Placeholder scan: no TBD/TODO except the intentional `// TODO(dashboard-auth)` in the endpoint code. ✓

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-27-dashboard-live-metrics-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
