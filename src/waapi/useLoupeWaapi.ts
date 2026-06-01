import { useEffect, useRef, useState } from 'react';
import { useMotionValueEvent } from 'framer-motion';
// Self-import the main entry so this subpath shares the same
// TimelineContext instance as `<TimelineProvider>`. If we import
// from a relative path here, tsup bundles a SECOND copy of the
// context into the waapi chunk and `useTimeline` can't see the
// provider. The main package is externalized in tsup.config so the
// host resolves this import to the already-loaded main bundle.
import { useTimeline } from '@arinze-clinton/loupe';

/**
 * Options for {@link useLoupeWaapi}.
 */
export type UseLoupeWaapiOptions = {
  /**
   * Create the Web Animations API animation(s). Call
   * `element.animate(keyframes, options)` as you normally would and
   * return the resulting `Animation` (or an array of them). The hook
   * pauses each one immediately — Loupe's `time` becomes the only
   * clock — and drives `currentTime` from there.
   *
   * Set `fill: 'both'` in your options so the element holds its
   * keyframe values when scrubbed to either edge; without it the
   * element snaps back to its base style outside the active range.
   *
   * Returns `null` (or an empty array) when the target element isn't
   * mounted yet — the hook no-ops until `deps` change.
   *
   * @example
   * ```ts
   * build: () =>
   *   boxRef.current?.animate(
   *     [
   *       { transform: 'translateY(40px)', opacity: 0 },
   *       { transform: 'translateY(0)', opacity: 1 },
   *     ],
   *     { duration: 500, easing: 'ease-out', fill: 'both' },
   *   ) ?? null
   * ```
   */
  build: () => Animation | Animation[] | null | undefined;
  /**
   * Recreate the animation(s) when any of these change (same
   * contract as a `useEffect` dep array). Typically include the
   * target element so the animation rebuilds once the ref attaches.
   * Defaults to `[]`.
   */
  deps?: ReadonlyArray<unknown>;
  /**
   * Wrap `currentTime` at the animation's end so it loops with
   * Loupe's own phase loop. Default `true`. Set `false` to clamp at
   * the end instead (holds the last frame past its duration).
   */
  loop?: boolean;
};

export type UseLoupeWaapiResult = {
  /** The live `Animation` objects the hook is driving. Empty until
   *  `build` first returns one. */
  animations: Animation[];
};

/**
 * Drive Web Animations API animations from the nearest
 * `TimelineProvider`'s `time` MotionValue.
 *
 * WAAPI animations expose `currentTime` in milliseconds — the same
 * unit as Loupe's clock — so this adapter is a thin bridge: it
 * pauses each animation (killing the browser's own playback) and
 * writes `currentTime` on every tick. Playing Loupe scrubs forward,
 * pausing freezes the current frame, and scrubbing the panel scrubs
 * the animation. No extra dependency — WAAPI is built into the
 * browser.
 *
 * @example
 * ```tsx
 * function Card() {
 *   const boxRef = useRef<HTMLDivElement | null>(null);
 *   useLoupeWaapi({
 *     deps: [boxRef.current],
 *     build: () =>
 *       boxRef.current?.animate(
 *         [
 *           { transform: 'translateY(40px)', opacity: 0 },
 *           { transform: 'translateY(0)', opacity: 1 },
 *         ],
 *         { duration: 500, easing: 'ease-out', fill: 'both' },
 *       ) ?? null,
 *   });
 *   return <div ref={boxRef}>Hello</div>;
 * }
 * ```
 */
export function useLoupeWaapi(
  opts: UseLoupeWaapiOptions,
): UseLoupeWaapiResult {
  const animsRef = useRef<Animation[]>([]);
  const [animations, setAnimations] = useState<Animation[]>([]);
  const { time } = useTimeline();

  // Keep the latest build/loop on refs so the change handler reads
  // fresh values without re-subscribing.
  const buildRef = useRef(opts.build);
  buildRef.current = opts.build;
  const loopRef = useRef(opts.loop !== false);
  loopRef.current = opts.loop !== false;

  useEffect(() => {
    const made = buildRef.current();
    const list = (Array.isArray(made) ? made : made ? [made] : []).filter(
      Boolean,
    ) as Animation[];

    // Loupe owns the clock — pause each animation so the browser's
    // own playback doesn't fight the panel for the playhead.
    for (const anim of list) {
      anim.pause();
      seekWaapi(anim, time.get(), loopRef.current);
    }

    animsRef.current = list;
    setAnimations(list);

    return () => {
      // cancel() clears currentTime + removes any fill effect so the
      // element returns to its natural style on unmount/rebuild.
      for (const anim of list) anim.cancel();
      animsRef.current = [];
      setAnimations([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, opts.deps ?? []);

  useMotionValueEvent(time, 'change', (ms) => {
    const list = animsRef.current;
    if (list.length === 0) return;
    const loop = loopRef.current;
    for (const anim of list) seekWaapi(anim, ms, loop);
  });

  return { animations };
}

/**
 * Set a WAAPI animation's `currentTime` (ms) from Loupe's time,
 * respecting wrap vs. clamp. Uses the computed `endTime` (which
 * already accounts for delay/endDelay/iterations) as the boundary.
 * If that's not a finite positive number — e.g. `iterations:
 * Infinity` — the time is passed through unbounded.
 */
function seekWaapi(anim: Animation, ms: number, loop: boolean): void {
  const end = anim.effect?.getComputedTiming().endTime;
  const endMs = typeof end === 'number' ? end : Number(end);
  if (!Number.isFinite(endMs) || endMs <= 0) {
    anim.currentTime = ms;
    return;
  }
  anim.currentTime = loop
    ? ((ms % endMs) + endMs) % endMs
    : Math.max(0, Math.min(ms, endMs));
}
