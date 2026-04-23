import { describe, it, expect } from 'vitest';
import { formatThousands } from './number';

// U+2009 THIN SPACE is the grouping separator per the AbstractNucleus design system.
const THIN = '\u2009';

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
});
