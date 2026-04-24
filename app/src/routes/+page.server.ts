// Fleet view SSR loader: hits beszel for the system list so the first paint
// already has the whole fleet visible. Realtime upgrades are the client's job.

import { env } from '$env/dynamic/public';
import { createClient } from '$lib/beszel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const client = createClient(env.PUBLIC_BESZEL_URL ?? '');
  const systems = await client.listSystems();
  return { systems };
};
