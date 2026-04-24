import { describe, it, expect } from 'vitest';
import { formatThousands, formatPercent, formatTabular } from './number';

// U+2009 THIN SPACE is the grouping separator per the AbstractNucleus design system.
const THIN = '\u2009';
// U+00A0 NO-BREAK SPACE is what formatTabular wedges between number and suffix.
const NBSP = '\u00A0';

describe('formatThousands', () => {
  it('returns "0" for zero', () => {
    expect(formatThousands(0)).toBe('0');
  });

  it('returns a single digit unchanged', () => {
    expect(formatThousands(9)).toBe('9');
  });

  it('returns three digits unchanged', () => {
    expect(formatThousands(999)).toBe('999');
  });

  it('groups four digits with a thin space', () => {
    expect(formatThousands(1000)).toBe(`1${THIN}000`);
  });

  it('groups six digits correctly', () => {
    expect(formatThousands(128430)).toBe(`128${THIN}430`);
  });

  it('preserves the leading minus for negatives and groups the magnitude', () => {
    expect(formatThousands(-1234567)).toBe(`-1${THIN}234${THIN}567`);
  });

  it('groups the integer part and preserves the decimal part', () => {
    expect(formatThousands(1234.56)).toBe(`1${THIN}234.56`);
  });

  it('falls back to em dash for NaN', () => {
    expect(formatThousands(Number.NaN)).toBe('—');
  });

  it('falls back to em dash for Infinity', () => {
    expect(formatThousands(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatThousands(Number.NEGATIVE_INFINITY)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('renders 0 as "0.0%" with the default one decimal', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('renders whole numbers with default one decimal', () => {
    expect(formatPercent(73)).toBe('73.0%');
  });

  it('respects a decimals=0 argument', () => {
    expect(formatPercent(73.6, 0)).toBe('74%');
  });

  it('respects a decimals=2 argument', () => {
    expect(formatPercent(73.456, 2)).toBe('73.46%');
  });

  it('clamps negative decimals to 0', () => {
    expect(formatPercent(50, -3)).toBe('50%');
  });

  it('floors fractional decimals to the integer below', () => {
    expect(formatPercent(12.345, 1.9)).toBe('12.3%');
  });

  it('treats asRatio:true as a 0..1 fraction and scales by 100', () => {
    expect(formatPercent(0.734, 1, { asRatio: true })).toBe('73.4%');
  });

  it('renders 100 as "100.0%" (no upper clamp)', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });

  it('renders values above 100 unchanged (no clamp)', () => {
    expect(formatPercent(150.5)).toBe('150.5%');
  });

  it('falls back to em dash for NaN', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('falls back to em dash for Infinity', () => {
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe('—');
  });
});

describe('formatTabular', () => {
  it('renders 0 with the default options (no decimals, grouped, no suffix)', () => {
    expect(formatTabular(0)).toBe('0');
  });

  it('groups the integer part with thin spaces by default', () => {
    expect(formatTabular(128430)).toBe(`128${THIN}430`);
  });

  it('disables grouping when group:false', () => {
    expect(formatTabular(128430, { group: false })).toBe('128430');
  });

  it('respects decimals', () => {
    expect(formatTabular(1234.5, { decimals: 2 })).toBe(`1${THIN}234.50`);
  });

  it('appends a suffix with an NBSP separator', () => {
    expect(formatTabular(42, { suffix: '°C' })).toBe(`42${NBSP}°C`);
  });

  it('combines decimals, grouping, and suffix', () => {
    expect(formatTabular(12345.678, { decimals: 1, suffix: 'ms' })).toBe(
      `12${THIN}345.7${NBSP}ms`
    );
  });

  it('rounds at the decimal boundary', () => {
    expect(formatTabular(0.5, { decimals: 0 })).toBe('1');
    expect(formatTabular(0.49, { decimals: 0 })).toBe('0');
  });

  it('preserves the leading minus on negative values', () => {
    expect(formatTabular(-1234, { decimals: 0 })).toBe(`-1${THIN}234`);
  });

  it('clamps negative decimals to 0', () => {
    expect(formatTabular(3.14, { decimals: -2 })).toBe('3');
  });

  it('falls back to em dash for NaN, preserving suffix alignment', () => {
    expect(formatTabular(Number.NaN)).toBe('—');
    expect(formatTabular(Number.NaN, { suffix: 'MB/s' })).toBe(`—${NBSP}MB/s`);
  });

  it('falls back to em dash for Infinity', () => {
    expect(formatTabular(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatTabular(Number.NEGATIVE_INFINITY, { suffix: '%' })).toBe(
      `—${NBSP}%`
    );
  });
});
