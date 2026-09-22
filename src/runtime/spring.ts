import { spring as framerSpring } from 'framer-motion';

/**
 * Spring sampling for the timeline.
 *
 * A spring is a function of time, so it belongs on the timeline like anything
 * else — it scrubs, pauses, and rewinds. But framer's spring generator is
 * *stateful*: it must be advanced in increasing time order, so it can't be
 * queried at a random `t` the way scrubbing needs. So we sample it once across
 * its duration into a lookup table and hand that to `useTransform`, which
 * interpolates between samples. Random access becomes a table lookup —
 * deterministic and scrub-safe.
 *
 * We use framer's own spring (Loupe's runtime is framer) so the scrubbed value
 * matches exactly how framer would render the same spring natively. The
 * `{ duration, bounce }` form is Apple's iOS-17 vocabulary: `duration` is how
 * long the motion visibly takes and the spring is fully settled by then;
 * `bounce` is overshoot (0 = none, ~0.3 = a gentle wobble). That keeps a spring
 * bounded to `[start, start + duration]`, same shape as an eased value.
 */

export type SpringSpec = {
  from: number;
  to: number;
  /** Visible settle time, ms. The spring is done by here. */
  duration: number;
  /** Overshoot: 0 lands clean, higher wobbles. Clamped to [0, 1). */
  bounce?: number;
};

export type SpringSamples = {
  /** Millisecond offsets from the spring's start, ascending, 0..duration. */
  offsets: number[];
  /** Spring value at each offset (may overshoot past `to`). */
  values: number[];
};

/** ~120fps sampling; dense enough that linear interpolation is invisible. */
const SAMPLE_INTERVAL_MS = 8;
const MIN_SAMPLES = 12;
const MAX_SAMPLES = 400;

/**
 * Sample a spring into an ascending offset→value table.
 *
 * Pure and deterministic. Falls back to a straight two-point ramp if framer's
 * spring is unavailable or throws, so a spring value never renders as nothing.
 */
export function sampleSpring(spec: SpringSpec): SpringSamples {
  const { from, to } = spec;
  const duration = Math.max(1, spec.duration);
  const bounce = Math.min(0.999, Math.max(0, spec.bounce ?? 0));

  const count = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.round(duration / SAMPLE_INTERVAL_MS)));

  try {
    const gen = framerSpring({ keyframes: [from, to], duration, bounce });
    const offsets: number[] = [];
    const values: number[] = [];
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * duration;
      const s = gen.next(t);
      offsets.push(t);
      values.push(typeof s.value === 'number' ? s.value : to);
    }
    // Pin the final sample exactly on target — floating error at the tail
    // shouldn't leave the value a hair off where it's supposed to rest.
    values[values.length - 1] = to;
    return { offsets, values };
  } catch {
    return { offsets: [0, duration], values: [from, to] };
  }
}
