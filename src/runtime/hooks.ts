import { useEffect, useMemo, useRef, useState } from 'react';
import { useTransform, type EasingFunction, type MotionValue } from 'framer-motion';
import { useTimeline } from './TimelineProvider';
import { HOUSE_CURVE_FN, phaseAtTime, rangeOf, type PhaseRange } from './phases';
import { sampleSpring } from './spring';

/** Subscribe to the raw time MotionValue of the active scene. */
export function useTimelineTime(): MotionValue<number> {
  return useTimeline().time;
}

/** Look up a range from the active scene's config. Throws if phase unknown. */
export function useRangeOf(phase: string): PhaseRange {
  const { ranges } = useTimeline();
  return rangeOf(ranges, phase);
}

type TimelineWindowOptions = {
  startMs?: number;
  endMs?: number;
  /** Shortcut: span the full duration of this phase. */
  phase?: string;
  /** Offset within the phase before the transition begins. */
  offset?: number;
  /** How long the transition runs (overrides endMs). */
  duration?: number;
};

type UseTimelineValueOptions = TimelineWindowOptions & {
  ease?: EasingFunction;
};

type UseTimelineSpringOptions = TimelineWindowOptions & {
  /** Overshoot: 0 lands clean, ~0.3 wobbles once. Defaults to a gentle 0.2. */
  bounce?: number;
};

/**
 * Resolve an animated value's [start, end] window on the scene clock. Shared
 * by `useTimelineValue` and `useTimelineSpring` so the two can never disagree
 * about where a value begins and ends. Mirrors the model `loupe resolve`
 * computes statically (cli/resolve.ts) — keep the three in step.
 */
function resolveWindow(
  options: TimelineWindowOptions,
  ranges: PhaseRange[],
  totalDuration: number,
): { start: number; end: number } {
  const { phase, offset = 0, duration, startMs, endMs } = options;
  if (phase) {
    const r = rangeOf(ranges, phase);
    const start = r.start + offset;
    return { start, end: duration !== undefined ? start + duration : r.end };
  }
  const start = startMs ?? 0;
  return {
    start,
    end: endMs ?? (duration !== undefined ? start + duration : totalDuration),
  };
}

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
  const { ease = HOUSE_CURVE_FN } = options;
  const { start, end } = resolveWindow(options, ranges, totalDuration);
  return useTransform(time, [start, end], [from, to], { ease, clamp: true });
}

/**
 * Like `useTimelineValue`, but the value springs `from → to` instead of
 * easing. A spring is still a pure function of time, so it scrubs, pauses, and
 * rewinds exactly like an eased value.
 *
 * `bounce` is Apple's iOS-17 spring vocabulary: 0 lands clean, higher overshoots
 * and wobbles. The spring settles within the window's duration, so its shape on
 * the timeline is the same `[start, end]` as an eased value — no phase or loop
 * gymnastics. Feedback like "it lands too hard" is a lower `bounce`; "too
 * springy" is lower still.
 */
export function useTimelineSpring(
  from: number,
  to: number,
  options: UseTimelineSpringOptions = {},
): MotionValue<number> {
  const { time, ranges, totalDuration } = useTimeline();
  const { bounce = 0.2 } = options;
  const { start, end } = resolveWindow(options, ranges, totalDuration);
  const duration = Math.max(1, end - start);

  const { offsets, values } = useMemo(
    () => sampleSpring({ from, to, duration, bounce }),
    [from, to, duration, bounce],
  );
  const inputRange = useMemo(() => offsets.map((o) => start + o), [offsets, start]);

  return useTransform(time, inputRange, values, { clamp: true });
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
