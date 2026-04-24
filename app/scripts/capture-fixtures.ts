/**
 * capture-fixtures — dump real Beszel responses into app/tests/fixtures/.
 *
 * Usage (against a local dev-mode Beszel hub):
 *   BESZEL_URL=http://localhost:8090 pnpm -C app capture-fixtures
 *   BESZEL_URL=http://localhost:8090 BESZEL_API_TOKEN=<token> pnpm -C app capture-fixtures
 *
 * Outputs (overwrites any existing file):
 *   app/tests/fixtures/systems.json         — array: `systems` collection via getFullList
 *   app/tests/fixtures/system_stats.json    — list-response: first page (20 newest) of `system_stats`
 *   app/tests/fixtures/containers.json      — array: `containers` collection via getFullList
 *   app/tests/fixtures/realtime-event.json  — one SSE envelope `{ action, record }` from a
 *                                             `system_stats` subscription
 *
 * Prerequisites:
 *   - A Beszel hub is reachable at BESZEL_URL. `docker compose up -d beszel-hub beszel-agent`
 *     (from a local Beszel checkout or this repo's deploy/) is enough.
 *   - At least one agent is pushing stats so the subscription fires within 10 s.
 *   - BESZEL_API_TOKEN is required only if the hub's collections are not publicly readable.
 *
 * Failure mode: if the hub is unreachable, auth fails, or no realtime event arrives in 10 s,
 * this script prints the error and exits 1. It does NOT write placeholder fixtures — a silent
 * placeholder would poison the parse tests next time someone runs against a real hub.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';

const REALTIME_TIMEOUT_MS = 10_000;

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(here, '..', 'tests', 'fixtures');

function fail(message: string, cause?: unknown): never {
  console.error(`capture-fixtures: ${message}`);
  if (cause instanceof Error) {
    console.error(cause.stack ?? cause.message);
  } else if (cause !== undefined) {
    console.error(cause);
  }
  process.exit(1);
}

function writeFixture(name: string, data: unknown): void {
  const path = resolve(FIXTURES_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`wrote ${path}`);
}

async function main() {
  const url = process.env.BESZEL_URL;
  const token = process.env.BESZEL_API_TOKEN;
  if (!url) {
    fail('BESZEL_URL env var is required (e.g. http://localhost:8090).');
  }

  const pb = new PocketBase(url);
  if (token) {
    // Token-only auth: store is populated but we do not try to refresh; the hub accepts the
    // token on each request. If it's invalid, the first collection call below will throw.
    pb.authStore.save(token);
  }

  let systems: unknown;
  try {
    systems = await pb.collection('systems').getFullList();
  } catch (err) {
    fail(`could not reach hub at ${url} while fetching systems`, err);
  }
  writeFixture('systems.json', systems);

  let systemStats: unknown;
  try {
    systemStats = await pb.collection('system_stats').getList(1, 20, { sort: '-created' });
  } catch (err) {
    fail(`failed to fetch system_stats from ${url}`, err);
  }
  writeFixture('system_stats.json', systemStats);

  let containers: unknown;
  try {
    containers = await pb.collection('containers').getFullList();
  } catch (err) {
    fail(`failed to fetch containers from ${url}`, err);
  }
  writeFixture('containers.json', containers);

  // Realtime capture — subscribe, wait for one event, unsubscribe.
  let unsubscribe: (() => void) | undefined;
  try {
    const event = await new Promise<{ action: string; record: unknown }>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        rejectPromise(
          new Error(
            `no realtime event on system_stats within ${REALTIME_TIMEOUT_MS}ms — is an agent actually pushing?`,
          ),
        );
      }, REALTIME_TIMEOUT_MS);

      pb.collection('system_stats')
        .subscribe('*', (data: { action: string; record: unknown }) => {
          clearTimeout(timer);
          resolvePromise(data);
        })
        .then((unsub) => {
          unsubscribe = unsub;
        })
        .catch((err) => {
          clearTimeout(timer);
          rejectPromise(err);
        });
    });
    writeFixture('realtime-event.json', event);
  } catch (err) {
    fail('realtime capture failed', err);
  } finally {
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // swallow — we're exiting anyway
      }
    }
  }

  console.log('capture-fixtures: done.');
  // The SSE connection keeps the event loop alive; force-exit so the script returns.
  process.exit(0);
}

main().catch((err) => fail('unexpected error', err));
