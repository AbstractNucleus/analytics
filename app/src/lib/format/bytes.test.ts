import { describe, it, expect } from 'vitest';
import { formatByteRate } from './bytes';

// U+00A0 NO-BREAK SPACE separates the magnitude from the unit suffix per the design system.
const NBSP = '\u00A0';

describe('formatByteRate', () => {
  it('renders 0 as "0 B/s" with no decimals', () => {
    expect(formatByteRate(0)).toBe(`0${NBSP}B/s`);
  });

  it('renders sub-kilobyte values as B/s with no decimals', () => {
    expect(formatByteRate(512)).toBe(`512${NBSP}B/s`);
  });

  it('renders just under 1000 as B/s', () => {
    expect(formatByteRate(999)).toBe(`999${NBSP}B/s`);
  });

  it('crosses to KB/s at exactly 1000', () => {
    expect(formatByteRate(1000)).toBe(`1.00${NBSP}KB/s`);
  });

  it('renders KB/s with two decimals', () => {
    expect(formatByteRate(1234)).toBe(`1.23${NBSP}KB/s`);
  });

  it('renders larger KB/s with two decimals', () => {
    expect(formatByteRate(999999)).toBe(`1000.00${NBSP}KB/s`);
  });

  it('crosses to MB/s at exactly 1_000_000', () => {
    expect(formatByteRate(1_000_000)).toBe(`1.00${NBSP}MB/s`);
  });

  it('renders the canonical MB/s example', () => {
    expect(formatByteRate(1_234_567)).toBe(`1.23${NBSP}MB/s`);
  });

  it('crosses to GB/s at exactly 1_000_000_000', () => {
    expect(formatByteRate(1_000_000_000)).toBe(`1.00${NBSP}GB/s`);
  });

  it('renders very large GB/s with two decimals', () => {
    expect(formatByteRate(12_345_678_900)).toBe(`12.35${NBSP}GB/s`);
  });

  it('preserves the leading minus on negative rates', () => {
    expect(formatByteRate(-1_234_567)).toBe(`-1.23${NBSP}MB/s`);
  });

  it('falls back to em dash for NaN', () => {
    expect(formatByteRate(Number.NaN)).toBe('—');
  });

  it('falls back to em dash for Infinity', () => {
    expect(formatByteRate(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatByteRate(Number.NEGATIVE_INFINITY)).toBe('—');
  });
});
