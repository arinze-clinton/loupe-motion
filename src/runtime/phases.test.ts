import { describe, it, expect } from 'vitest';
import {
  computeRanges,
  totalDurationFor,
  rangeOf,
  phaseAtTime,
  wrapTime,
} from './phases';

const CONFIG = {
  id: 'test',
  label: 'Test',
  phaseOrder: ['idle', 'enter', 'hold', 'exit'] as const,
  phaseDurations: { idle: 100, enter: 200, hold: 300, exit: 100 },
};

describe('computeRanges', () => {
  it('lays phases end-to-end', () => {
    const ranges = computeRanges(CONFIG);
    expect(ranges).toEqual([
      { phase: 'idle', start: 0, end: 100, duration: 100 },
      { phase: 'enter', start: 100, end: 300, duration: 200 },
      { phase: 'hold', start: 300, end: 600, duration: 300 },
      { phase: 'exit', start: 600, end: 700, duration: 100 },
    ]);
  });
});

describe('totalDurationFor', () => {
  it('returns the end of the last range', () => {
    expect(totalDurationFor(computeRanges(CONFIG))).toBe(700);
  });
  it('returns 0 for empty ranges', () => {
    expect(totalDurationFor([])).toBe(0);
  });
});

describe('phaseAtTime', () => {
  const ranges = computeRanges(CONFIG);
  const total = totalDurationFor(ranges);

  it('finds the phase covering t', () => {
    expect(phaseAtTime(ranges, total, 0)).toBe('idle');
    expect(phaseAtTime(ranges, total, 150)).toBe('enter');
    expect(phaseAtTime(ranges, total, 400)).toBe('hold');
    expect(phaseAtTime(ranges, total, 650)).toBe('exit');
  });

  it('clamps t at the end to the last phase', () => {
    expect(phaseAtTime(ranges, total, total)).toBe('exit');
    expect(phaseAtTime(ranges, total, total + 1000)).toBe('exit');
  });
});

describe('wrapTime', () => {
  it('passes through values inside [0, total)', () => {
    expect(wrapTime(0, 700)).toBe(0);
    expect(wrapTime(350, 700)).toBe(350);
    expect(wrapTime(699.999, 700)).toBeCloseTo(699.999);
  });

  it('wraps a single period over', () => {
    expect(wrapTime(700, 700)).toBe(0);
    expect(wrapTime(750, 700)).toBe(50);
  });

  // Regression: previously `next - totalDuration` only subtracted one
  // period, so a backgrounded tab returning with dt = many seconds
  // left `time` outside [0, totalDuration) and broke phase lookup.
  it('wraps multi-period overshoot (tab-backgrounded case)', () => {
    expect(wrapTime(2050, 700)).toBe(650);
    expect(wrapTime(7000, 700)).toBe(0);
    expect(wrapTime(7050, 700)).toBe(50);
  });

  it('wraps negatives back into range', () => {
    expect(wrapTime(-50, 700)).toBe(650);
    expect(wrapTime(-700, 700)).toBe(0);
  });

  it('returns t unchanged when total is 0', () => {
    expect(wrapTime(123, 0)).toBe(123);
    expect(wrapTime(0, 0)).toBe(0);
  });
});

describe('rangeOf', () => {
  it('returns the matching range', () => {
    const ranges = computeRanges(CONFIG);
    expect(rangeOf(ranges, 'enter')).toEqual({
      phase: 'enter',
      start: 100,
      end: 300,
      duration: 200,
    });
  });
});
