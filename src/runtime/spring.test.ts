import { describe, it, expect } from 'vitest';
import { sampleSpring } from './spring';

/**
 * Springs must behave as a scrub-safe function of time: start at `from`, end
 * exactly at `to`, ascending sample offsets bounded by duration, and a real
 * overshoot when asked to bounce.
 */
describe('sampleSpring', () => {
  it('starts at `from` and ends exactly at `to`', () => {
    const { values } = sampleSpring({ from: 0, to: 1, duration: 500, bounce: 0.3 });
    expect(values[0]).toBeCloseTo(0, 5);
    expect(values[values.length - 1]).toBe(1);
  });

  it('produces ascending offsets from 0 to duration', () => {
    const { offsets } = sampleSpring({ from: 0, to: 1, duration: 500, bounce: 0.2 });
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBeCloseTo(500, 5);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]!);
    }
  });

  it('overshoots past the target when bounce > 0', () => {
    const bouncy = sampleSpring({ from: 0, to: 1, duration: 600, bounce: 0.5 });
    const peak = Math.max(...bouncy.values);
    expect(peak).toBeGreaterThan(1); // it wobbles past the target
  });

  it('does not overshoot when bounce is 0', () => {
    const clean = sampleSpring({ from: 0, to: 1, duration: 400, bounce: 0 });
    const peak = Math.max(...clean.values);
    expect(peak).toBeLessThanOrEqual(1.0001);
  });

  it('handles a downward spring (from > to)', () => {
    const { values } = sampleSpring({ from: 40, to: 0, duration: 500, bounce: 0.3 });
    expect(values[0]).toBeCloseTo(40, 5);
    expect(values[values.length - 1]).toBe(0);
  });

  it('clamps a pathological duration without throwing', () => {
    expect(() => sampleSpring({ from: 0, to: 1, duration: 0, bounce: 0 })).not.toThrow();
    const { offsets } = sampleSpring({ from: 0, to: 1, duration: 0, bounce: 0 });
    expect(offsets.length).toBeGreaterThanOrEqual(2);
  });
});
