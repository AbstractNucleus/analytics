/**
 * Number-formatting helpers for the AbstractNucleus design system.
 *
 * Rules locked by the design system:
 *  - Thousands grouping uses U+2009 THIN SPACE, not a comma.
 *  - No K/M/B suffixes — always full digits.
 *  - Numbers are rendered in tabular figures (CSS handles the glyph width;
 *    these helpers handle the string).
 */

/** U+2009 THIN SPACE — the grouping separator mandated by the design system. */
export const THIN_SPACE = '\u2009';

/**
 * Group the integer part of `n` with thin spaces every three digits.
 *
 * - Negatives keep the leading `-` and the magnitude is grouped.
 * - Decimals preserve the fractional part as written by JS (`Number.toString`).
 * - `NaN` and non-finite values return `'—'` (em dash) so the UI does not
 *   display noise; callers that want a different fallback should check first.
 */
export function formatThousands(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const negative = n < 0;
  const magnitude = negative ? -n : n;
  const [intPart, fracPart] = magnitude.toString().split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  const body = fracPart === undefined ? grouped : `${grouped}.${fracPart}`;
  return negative ? `-${body}` : body;
}

/**
 * Format `n` (a fraction in the range 0..1 *or* a percentage in the range 0..100 —
 * see `asRatio`) as a percentage string with `decimals` digits after the point
 * and a trailing `%`.
 *
 * By default `n` is treated as already-in-percent (e.g. `73.4` → `"73.4%"`) so
 * callers working with Beszel's already-percent fields don't have to multiply
 * by 100 at every callsite. Pass `{ asRatio: true }` to treat `n` as a 0..1
 * fraction.
 *
 * `decimals` defaults to `1`. NaN/Infinity fall back to `'—'`.
 */
export function formatPercent(
  n: number,
  decimals: number = 1,
  opts: { asRatio?: boolean } = {}
): string {
  if (!Number.isFinite(n)) return '—';
  const safeDecimals = Math.max(0, Math.min(20, Math.floor(decimals)));
  const pct = opts.asRatio ? n * 100 : n;
  return `${pct.toFixed(safeDecimals)}%`;
}

/**
 * Options for {@link formatTabular}.
 *
 * `decimals` pins the number of fractional digits (default `0`). `group`
 * toggles thin-space grouping of the integer part (default `true`). `suffix`
 * is appended verbatim — if provided, a non-breaking space separates it from
 * the number (callers that want no separator can include it in the suffix).
 */
export interface FormatTabularOptions {
  decimals?: number;
  group?: boolean;
  suffix?: string;
}

/**
 * Format `n` for a tabular readout: fixed decimals, thin-space grouping,
 * optional unit suffix.
 *
 * NaN/Infinity fall back to `'—'` plus the suffix (if any), so a column of
 * readouts stays aligned even when upstream data is missing.
 */
export function formatTabular(n: number, opts: FormatTabularOptions = {}): string {
  const { decimals = 0, group = true, suffix } = opts;
  const safeDecimals = Math.max(0, Math.min(20, Math.floor(decimals)));
  const sepSuffix = suffix ? `\u00A0${suffix}` : '';

  if (!Number.isFinite(n)) return `—${sepSuffix}`;

  const negative = n < 0;
  const magnitude = negative ? -n : n;
  const fixed = magnitude.toFixed(safeDecimals);
  const [intPart, fracPart] = fixed.split('.');
  const intGrouped = group
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE)
    : intPart;
  const body = fracPart === undefined ? intGrouped : `${intGrouped}.${fracPart}`;
  const signed = negative ? `-${body}` : body;
  return `${signed}${sepSuffix}`;
}
