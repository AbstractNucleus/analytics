// Fleet view SSR loader: hits beszel for the system list so the first paint
// already has the whole fleet visible. Realtime upgrades are the client's job.

import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createClient } from '$lib/beszel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const client = createClient(publicEnv.PUBLIC_BESZEL_URL ?? '', privateEnv.BESZEL_API_TOKEN);
  const systems = await client.listSystems();
  return { systems };
};
