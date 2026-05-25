// Per-host SSR loader: pulls the system row, its static hardware/OS details,
// recent samples in the selected time window, and the current container list
// so the initial paint already has data to render. The time window is read
// from `?range=` so the toggle in the header drives a real refetch (not just
// a client-side display flip).

import { error } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createClient, type TimeRange } from '$lib/beszel';
import type { PageServerLoad } from './$types';

const VALID_RANGES: readonly TimeRange[] = ['1h', '24h', '7d', '30d'];
const DEFAULT_RANGE: TimeRange = '24h';

function parseRange(raw: string | null): TimeRange {
  if (raw && (VALID_RANGES as readonly string[]).includes(raw)) {
    return raw as TimeRange;
  }
  return DEFAULT_RANGE;
}

export const load: PageServerLoad = async ({ params, url }) => {
  const range = parseRange(url.searchParams.get('range'));
  const client = createClient(publicEnv.PUBLIC_BESZEL_URL ?? '', privateEnv.BESZEL_API_TOKEN);
  try {
    const [system, systemDetails, samples, containers] = await Promise.all([
      client.getSystem(params.slug),
      client.getSystemDetails(params.slug),
      client.getRecentStats(params.slug, range),
      client.listContainers(params.slug),
    ]);
    return { system, systemDetails, samples, containers, range };
  } catch (err) {
    // PocketBase's ClientResponseError sets `.status` to the upstream HTTP
    // code; a real 404 means the slug is unknown. Every other shape (abort,
    // network, 5xx, JSON-parse failure) is the hub failing — surfacing those
    // as "Unknown host" would mislead the user into thinking they typoed.
    if ((err as { status?: unknown }).status === 404) {
      error(404, `Unknown host: ${params.slug}`);
    }
    error(503, 'Beszel hub did not respond. Check PUBLIC_BESZEL_URL and that the hub is reachable.');
  }
};
