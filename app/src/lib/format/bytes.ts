/**
 * Byte-rate formatting for the AbstractNucleus design system.
 *
 * Rules locked by the design system:
 *  - Decimal (SI, 1000-based) units — B/s, KB/s, MB/s, GB/s. Never binary
 *    (KiB/s, MiB/s, …) — Beszel reports decimal and users expect parity.
 *  - U+00A0 NBSP between magnitude and unit so the pair never line-wraps.
 *  - 0 decimals at B/s (sub-kilobyte values are always whole bytes anyway);
 *    2 decimals at all higher scales for column alignment.
 */

const NBSP = '\u00A0';
const K = 1000;
const M = 1_000_000;
const G = 1_000_000_000;

/**
 * Format `bytesPerSecond` as a human-readable rate with an auto-selected unit.
 *
 * Thresholds are chosen so a value is rendered in the largest unit where the
 * magnitude is still ≥ 1 (e.g. 999_999 renders as `1000.00 KB/s`, not
 * `0.99 MB/s`). NaN/Infinity fall back to `'—'`.
 */
export function formatByteRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond)) return '—';

  const negative = bytesPerSecond < 0;
  const magnitude = negative ? -bytesPerSecond : bytesPerSecond;

  let value: number;
  let unit: string;
  if (magnitude < K) {
    value = magnitude;
    unit = 'B/s';
    const rendered = value.toFixed(0);
    return `${negative ? '-' : ''}${rendered}${NBSP}${unit}`;
  } else if (magnitude < M) {
    value = magnitude / K;
    unit = 'KB/s';
  } else if (magnitude < G) {
    value = magnitude / M;
    unit = 'MB/s';
  } else {
    value = magnitude / G;
    unit = 'GB/s';
  }

  const rendered = value.toFixed(2);
  return `${negative ? '-' : ''}${rendered}${NBSP}${unit}`;
}
