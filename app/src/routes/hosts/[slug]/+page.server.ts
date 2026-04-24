// Per-host SSR loader: pulls the system row, last 24h of samples, and the
// current container list so the initial paint already has data to render.

import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { createClient } from '$lib/beszel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const client = createClient(env.PUBLIC_BESZEL_URL ?? '');
  try {
    const [system, samples, containers] = await Promise.all([
      client.getSystem(params.slug),
      client.getRecentStats(params.slug, '24h'),
      client.listContainers(params.slug)
    ]);
    return { system, samples, containers };
  } catch (err) {
    throw error(404, `Unknown host: ${params.slug}`);
  }
};
