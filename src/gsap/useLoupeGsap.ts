import { useEffect, useRef, useState } from 'react';
import { useMotionValueEvent } from 'framer-motion';
import type { gsap } from 'gsap';
// Self-import the main entry so this subpath shares the same
// TimelineContext instance as `<TimelineProvider>`. If we import
// from a relative path here, tsup bundles a SECOND copy of the
// context into the gsap chunk and `useTimeline` can't see the
// provider — which produces a white screen ("useTimeline must be
// used inside <TimelineProvider>"). The main package is
// externalized in tsup.config so the host resolves this import to
// the already-loaded main bundle at runtime.
import { useTimeline } from '@arinze-clinton/loupe';

/** A seekable GSAP timeline or tween. Both expose `.time()`,
 *  `.duration()`, `.pause()`, and `.kill()`. */
type GsapPlayhead = gsap.core.Timeline | gsap.core.Tween;

/**
 * Options for {@link useLoupeGsap}.
 */
export type UseLoupeGsapOptions = {
  /**
   * Build the GSAP timeline (or tween). Receives the loaded `gsap`
   * instance so you don't have to import it yourself, and must
   * return the timeline/tween you want Loupe to drive.
   *
   * The timeline is created with its own clock disabled — Loupe's
   * `time` becomes the single source of truth. Build it the way you
   * always would (`gsap.timeline().to(...).from(...)`); the hook
   * pauses it for you.
   *
   * @example
   * ```ts
   * build: (gsap) =>
   *   gsap.timeline()
   *     .from('.title', { y: 40, opacity: 0, duration: 0.5 })
   *     .from('.subtitle', { opacity: 0, duration: 0.4 }, '-=0.2')
   * ```
   */
  build: (g: typeof gsap) => GsapPlayhead;
  /**
   * Optional element to scope GSAP selector text (`'.title'`) and
   * cleanup to. When set, the timeline is built inside a
   * `gsap.context(fn, scope)` so selectors only match descendants
   * and every tween is reverted on unmount/rebuild. Strongly
   * recommended in React. Pass the ref's `.current`.
   */
  scope?: Element | null;
  /**
   * Rebuild the timeline when any of these change (same contract as
   * a `useEffect` dep array). Defaults to `[]` — built once.
   */
  deps?: ReadonlyArray<unknown>;
  /**
   * Wrap the playhead at the timeline's duration boundary so it
   * loops with Loupe's own phase loop. Default `true`. Set `false`
   * to clamp at the end instead (the timeline holds its last frame
   * past its duration).
   */
  loop?: boolean;
};

export type UseLoupeGsapResult = {
  /** The built GSAP timeline/tween, once ready. Null on the first
   *  render before the dynamic import resolves. */
  timeline: GsapPlayhead | null;
};

/**
 * Drive a GSAP timeline's playhead from the nearest
 * `TimelineProvider`'s `time` MotionValue.
 *
 * GSAP's own ticker is never used — the timeline is paused on
 * creation and every position comes from Loupe's deterministic
 * clock. When Loupe plays, the timeline scrubs forward; when Loupe
 * pauses, it freezes on the current position; scrubbing the panel
 * scrubs the timeline. That makes the same animation reproducible
 * for thumbnails, still renders, and review.
 *
 * `gsap` is an optional peer dependency — install it in your app:
 * `npm i gsap`. It's dynamic-imported so consumers who don't touch
 * the `/gsap` subpath never pay for it.
 *
 * @example
 * ```tsx
 * function Hero() {
 *   const scopeRef = useRef<HTMLDivElement | null>(null);
 *   useLoupeGsap({
 *     scope: scopeRef.current,
 *     deps: [scopeRef.current],
 *     build: (gsap) =>
 *       gsap.timeline()
 *         .from('.title', { y: 40, opacity: 0, duration: 0.5 })
 *         .from('.cta', { opacity: 0, duration: 0.4 }, '-=0.2'),
 *   });
 *   return (
 *     <div ref={scopeRef}>
 *       <h1 className="title">Loupe</h1>
 *       <button className="cta">Try it</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useLoupeGsap(opts: UseLoupeGsapOptions): UseLoupeGsapResult {
  const tlRef = useRef<GsapPlayhead | null>(null);
  const [timeline, setTimeline] = useState<GsapPlayhead | null>(null);
  const { time } = useTimeline();

  // Keep the latest options on a ref so the change handler and the
  // build effect always read fresh values without re-subscribing.
  const buildRef = useRef(opts.build);
  buildRef.current = opts.build;
  const loopRef = useRef(opts.loop !== false);
  loopRef.current = opts.loop !== false;
  const scope = opts.scope;

  // Build (and rebuild) the timeline. gsap is dynamic-imported so
  // the runtime package stays gsap-free at import time.
  useEffect(() => {
    let cancelled = false;
    let ctx: gsap.Context | null = null;
    let built: GsapPlayhead | null = null;

    (async () => {
      const mod = await import('gsap');
      if (cancelled) return;
      const g = (mod as { gsap?: typeof gsap }).gsap ?? (mod.default as typeof gsap);

      const make = () => {
        built = buildRef.current(g);
        // Loupe owns the clock — kill GSAP's own playback so the
        // two don't fight over the playhead.
        built.pause(0);
        tlRef.current = built;
        setTimeline(built);
        // Snap to wherever time already is so we don't flash the
        // timeline's start before the first subscriber tick fires.
        seekTo(built, time.get(), loopRef.current);
      };

      if (scope) {
        ctx = g.context(make, scope);
      } else {
        make();
      }
    })();

    return () => {
      cancelled = true;
      // `ctx.revert()` undoes every tween created inside the scope
      // and reverts inline styles to their pre-animation values.
      // Without a scope, kill the timeline directly.
      if (ctx) ctx.revert();
      else if (built) built.kill();
      tlRef.current = null;
      setTimeline(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, opts.deps ?? []);

  // Drive the playhead from Loupe's time MotionValue.
  useMotionValueEvent(time, 'change', (ms) => {
    const tl = tlRef.current;
    if (!tl) return;
    seekTo(tl, ms, loopRef.current);
  });

  return { timeline };
}

/**
 * Move a GSAP timeline/tween to the position implied by Loupe's
 * `time` (ms), respecting wrap vs. clamp. GSAP works in seconds, so
 * we convert. `suppressEvents = true` keeps callbacks from firing on
 * scrub (matching how `goToAndStop` behaves for Lottie).
 */
function seekTo(tl: GsapPlayhead, ms: number, loop: boolean): void {
  const durationS = tl.duration();
  if (!durationS) return;
  const seconds = ms / 1000;
  let pos: number;
  if (loop) {
    pos = ((seconds % durationS) + durationS) % durationS;
  } else {
    pos = Math.max(0, Math.min(seconds, durationS));
  }
  tl.time(pos, true);
}
