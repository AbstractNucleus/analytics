// Per-host SSR loader: pulls the system row, its static hardware/OS details,
// the last 24h of samples, and the current container list so the initial paint
// already has data to render.

import { error } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createClient } from '$lib/beszel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const client = createClient(publicEnv.PUBLIC_BESZEL_URL ?? '', privateEnv.BESZEL_API_TOKEN);
  try {
    const [system, systemDetails, samples, containers] = await Promise.all([
      client.getSystem(params.slug),
      client.getSystemDetails(params.slug),
      client.getRecentStats(params.slug, '24h'),
      client.listContainers(params.slug),
    ]);
    return { system, systemDetails, samples, containers };
  } catch (err) {
    throw error(404, `Unknown host: ${params.slug}`);
  }
};
