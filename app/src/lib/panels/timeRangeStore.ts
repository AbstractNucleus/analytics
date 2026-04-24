// Layout-level time-range selection shared by every panel on the current route.
// Matches the vocabulary used by $lib/chart/timeRangeWindow and the beszel
// client's getRecentStats(range), so the three stay in lockstep.

import { writable, type Writable } from 'svelte/store';

export type TimeRange = '1h' | '24h' | '7d' | '30d';

const DEFAULT: TimeRange = '24h';

export const range: Writable<TimeRange> = writable<TimeRange>(DEFAULT);

export function setRange(value: TimeRange): void {
  range.set(value);
}
