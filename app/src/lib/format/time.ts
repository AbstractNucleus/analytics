/**
 * Time-formatting helpers for the AbstractNucleus design system.
 *
 * Rules locked by the design system:
 *  - Relative times use single-letter unit suffixes: `s`, `m`, `h`, `d`.
 *  - Past reads "Xs ago", future reads "in Xs". Exactly-now is "just now".
 *  - `nowMs` is injectable for deterministic tests — omit in app code to use
 *    `Date.now()`.
 */

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Render the signed distance between `whenMs` and `nowMs` in the largest unit
 * with a non-zero magnitude (seconds → minutes → hours → days).
 *
 * NaN/Infinity on either input fall back to `'—'`.
 */
export function formatRelativeTime(whenMs: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(whenMs) || !Number.isFinite(nowMs)) return '—';

  const diffMs = nowMs - whenMs;
  if (diffMs === 0) return 'just now';

  const past = diffMs > 0;
  const absMs = past ? diffMs : -diffMs;

  let value: number;
  let unit: string;
  if (absMs < MINUTE_MS) {
    value = Math.floor(absMs / SECOND_MS);
    unit = 's';
  } else if (absMs < HOUR_MS) {
    value = Math.floor(absMs / MINUTE_MS);
    unit = 'm';
  } else if (absMs < DAY_MS) {
    value = Math.floor(absMs / HOUR_MS);
    unit = 'h';
  } else {
    value = Math.floor(absMs / DAY_MS);
    unit = 'd';
  }

  return past ? `${value}${unit} ago` : `in ${value}${unit}`;
}

const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;

/**
 * Render a monotonic uptime in seconds as `Xd HHh` — days unpadded, hours
 * always two-digit so a column of readouts stays vertically aligned.
 *
 * Partial hours truncate; uptime is a monotonic counter, not a duration, so
 * rounding up could show "24h" the instant before the day rolls over.
 * NaN/Infinity/negative values fall back to `'—'`.
 */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';

  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const hh = hours.toString().padStart(2, '0');
  return `${days}d ${hh}h`;
}
