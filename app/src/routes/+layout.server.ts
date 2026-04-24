// Expose PUBLIC_BESZEL_URL at runtime (not build time) so the deployment
// image can switch between staging/prod without rebuilding.

import { env } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
  beszelUrl: env.PUBLIC_BESZEL_URL
});
