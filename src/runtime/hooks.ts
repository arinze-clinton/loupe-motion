import { useEffect, useRef, useState } from 'react';
import { useTransform, type EasingFunction, type MotionValue } from 'framer-motion';
import { useTimeline } from './TimelineProvider';
import { HOUSE_CURVE_FN, phaseAtTime, rangeOf, type PhaseRange } from './phases';

/** Subscribe to the raw time MotionValue of the active scene. */
export function useTimelineTime(): MotionValue<number> {
  return useTimeline().time;
}

/** Look up a range from the active scene's config. Throws if phase unknown. */
export function useRangeOf(phase: string): PhaseRange {
  const { ranges } = useTimeline();
  return rangeOf(ranges, phase);
}

type UseTimelineValueOptions = {
  startMs?: number;
  endMs?: number;
  /** Shortcut: span the full duration of this phase. */
  phase?: string;
  /** Offset within the phase before the transition begins. */
  offset?: number;
  /** How long the transition runs (overrides endMs). */
  duration?: number;
  ease?: EasingFunction;
};

/**
 * Derive a MotionValue animating `from → to` between two timeline points.
 * Holds at `from` before the window and at `to` after it.
 */
export function useTimelineValue(
  from: number,
  to: number,
  options: UseTimelineValueOptions = {},
): MotionValue<number> {
  const { time, ranges, totalDuration } = useTimeline();
  const { phase, offset = 0, duration, startMs, endMs, ease = HOUSE_CURVE_FN } = options;

  let start: number;
  let end: number;
  if (phase) {
    const r = rangeOf(ranges, phase);
    start = r.start + offset;
    end = duration !== undefined ? start + duration : r.end;
  } else {
    start = startMs ?? 0;
    end = endMs ?? (duration !== undefined ? start + duration : totalDuration);
  }

  return useTransform(time, [start, end], [from, to], { ease, clamp: true });
}

/** Current phase name, derived from time on every tick. */
export function usePhaseFromTime(): string {
  const { time, ranges, totalDuration } = useTimeline();
  const [phase, setPhase] = useState<string>(() =>
    phaseAtTime(ranges, totalDuration, time.get()),
  );
  useEffect(() => {
    const unsubscribe = time.on('change', (ms) => {
      const next = phaseAtTime(ranges, totalDuration, ms);
      setPhase((prev) => (prev === next ? prev : next));
    });
    return unsubscribe;
  }, [time, ranges, totalDuration]);
  return phase;
}

/**
 * Counter that increments each time the timeline ENTERS `targetPhase`.
 * Use as a `playKey` on one-shot effects (Lottie, Web Animations) so they
 * re-trigger on every loop pass and on scrub-past-then-forward.
 */
export function usePhaseEnterKey(targetPhase: string): number {
  const phase = usePhaseFromTime();
  const [key, setKey] = useState(0);
  const prevRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase === targetPhase && prevRef.current !== targetPhase) {
      setKey((k) => k + 1);
    }
    prevRef.current = phase;
  }, [phase, targetPhase]);
  return key;
}
