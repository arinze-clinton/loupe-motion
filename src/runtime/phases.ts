import { cubicBezier, type EasingFunction } from 'framer-motion';

export type SceneConfig = {
  id: string;
  label: string;
  phaseOrder: readonly string[];
  phaseDurations: Readonly<Record<string, number>>;
  phaseLabels?: Readonly<Record<string, string>>;
};

export type PhaseRange = {
  phase: string;
  start: number;
  end: number;
  duration: number;
};

export function computeRanges(config: SceneConfig): PhaseRange[] {
  const out: PhaseRange[] = [];
  let cursor = 0;
  for (const phase of config.phaseOrder) {
    const duration = config.phaseDurations[phase] ?? 0;
    out.push({ phase, start: cursor, end: cursor + duration, duration });
    cursor += duration;
  }
  return out;
}

export function totalDurationFor(ranges: PhaseRange[]): number {
  if (ranges.length === 0) return 0;
  return ranges[ranges.length - 1].end;
}

export function rangeOf(ranges: PhaseRange[], phase: string): PhaseRange {
  const found = ranges.find((r) => r.phase === phase);
  if (!found) throw new Error(`Phase "${phase}" has no range`);
  return found;
}

/**
 * Wrap `t` into the range `[0, total)`. Used by the rAF tick to keep
 * `time` bounded after the loop hits the end. Handles dt accumulating
 * beyond a single period (e.g. tab backgrounded, then resumed) and
 * negative inputs.
 */
export function wrapTime(t: number, total: number): number {
  if (total <= 0) return t;
  return ((t % total) + total) % total;
}

export function phaseAtTime(
  ranges: PhaseRange[],
  totalDuration: number,
  time: number,
): string {
  if (ranges.length === 0) return '';
  const t = Math.max(0, Math.min(time, totalDuration - 0.001));
  for (const r of ranges) {
    if (t >= r.start && t < r.end) return r.phase;
  }
  return ranges[ranges.length - 1].phase;
}

/** Calm, decisive easing — no bounce. Loupe's house default. */
export const HOUSE_CURVE_FN: EasingFunction = cubicBezier(0.59, 0.01, 0.4, 0.98);

/** Soft settle with mild overshoot — for cards landing into place. */
export const SETTLE_CURVE_FN: EasingFunction = cubicBezier(
  0.175,
  0.885,
  0.32,
  1.275,
);
