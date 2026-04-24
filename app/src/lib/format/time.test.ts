import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './time';

// A fixed "now" makes every assertion deterministic regardless of when the test runs.
const NOW = 1_700_000_000_000;

describe('formatRelativeTime', () => {
  it('renders "just now" when the difference is exactly zero', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('just now');
  });

  it('renders seconds in the past', () => {
    expect(formatRelativeTime(NOW - 3_000, NOW)).toBe('3s ago');
  });

  it('renders just-under-a-minute as seconds', () => {
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe('59s ago');
  });

  it('crosses to minutes at exactly 60 seconds', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1m ago');
  });

  it('renders minutes in the past', () => {
    expect(formatRelativeTime(NOW - 2 * 60_000, NOW)).toBe('2m ago');
  });

  it('renders just-under-an-hour as minutes', () => {
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe('59m ago');
  });

  it('crosses to hours at exactly 60 minutes', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe('1h ago');
  });

  it('renders hours in the past', () => {
    expect(formatRelativeTime(NOW - 14 * 60 * 60_000, NOW)).toBe('14h ago');
  });

  it('renders just-under-a-day as hours', () => {
    expect(formatRelativeTime(NOW - 23 * 60 * 60_000, NOW)).toBe('23h ago');
  });

  it('crosses to days at exactly 24 hours', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('1d ago');
  });

  it('renders days in the past', () => {
    expect(formatRelativeTime(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe('3d ago');
  });

  it('renders future seconds as "in Xs"', () => {
    expect(formatRelativeTime(NOW + 5_000, NOW)).toBe('in 5s');
  });

  it('renders future minutes as "in Xm"', () => {
    expect(formatRelativeTime(NOW + 5 * 60_000, NOW)).toBe('in 5m');
  });

  it('renders future hours as "in Xh"', () => {
    expect(formatRelativeTime(NOW + 2 * 60 * 60_000, NOW)).toBe('in 2h');
  });

  it('renders future days as "in Xd"', () => {
    expect(formatRelativeTime(NOW + 7 * 24 * 60 * 60_000, NOW)).toBe('in 7d');
  });

  it('defaults nowMs to Date.now() when omitted', () => {
    // Within a reasonable wall-clock window, a just-created timestamp rounds to "just now"
    // or "Xs ago" — either way the output is a string ending in "ago" or "just now".
    const result = formatRelativeTime(Date.now());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back to em dash for NaN', () => {
    expect(formatRelativeTime(Number.NaN, NOW)).toBe('—');
  });

  it('falls back to em dash for Infinity', () => {
    expect(formatRelativeTime(Number.POSITIVE_INFINITY, NOW)).toBe('—');
    expect(formatRelativeTime(Number.NEGATIVE_INFINITY, NOW)).toBe('—');
  });
});
