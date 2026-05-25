// Layout-level server load.
//
// Two responsibilities:
//   1. Expose PUBLIC_BESZEL_URL at runtime (not build time) so the deployment
//      image can switch between staging/prod without rebuilding.
//   2. Fetch the system list once for the sidebar so every route in the shell
//      can render the same persistent navigation without re-fetching.
//
// Loading `systems` here is intentionally graceful: if the hub is unreachable
// we return `systems: []` so the sidebar renders an empty state. Per-route
// loaders (the fleet page, the per-host page) still throw 503 on their own
// when the hub is down, so the page itself surfaces the failure clearly — the
// shell just doesn't compound the error by also 503'ing.

import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createClient, type SystemRow } from '$lib/beszel';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  const client = createClient(
    publicEnv.PUBLIC_BESZEL_URL ?? '',
    privateEnv.BESZEL_API_TOKEN,
  );
  let systems: SystemRow[] = [];
  try {
    systems = await client.listSystems();
  } catch {
    // Swallowed deliberately — see file header. Routes that need a guaranteed
    // hub response (fleet, per-host) handle their own errors.
    systems = [];
  }
  return {
    beszelUrl: publicEnv.PUBLIC_BESZEL_URL,
    systems,
  };
};
