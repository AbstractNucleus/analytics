// Fleet view SSR loader: hits beszel for the system list so the first paint
// already has the whole fleet visible. Realtime upgrades are the client's job.

import { error } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createClient } from '$lib/beszel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const client = createClient(publicEnv.PUBLIC_BESZEL_URL ?? '', privateEnv.BESZEL_API_TOKEN);
  try {
    const systems = await client.listSystems();
    return { systems };
  } catch {
    // The fleet endpoint has only one failure mode: the hub. Anything that
    // throws here — abort/timeout, network refused, PB-parsed 4xx/5xx — is
    // the hub being unreachable or misconfigured.
    error(503, 'Beszel hub did not respond. Check PUBLIC_BESZEL_URL and that the hub is reachable.');
  }
};
