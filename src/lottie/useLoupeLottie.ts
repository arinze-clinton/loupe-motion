import { useEffect, useRef } from 'react';
import { useMotionValueEvent } from 'framer-motion';
import type { AnimationItem } from 'lottie-web';
// Self-import the main entry so this subpath shares the same
// TimelineContext instance as `<TimelineProvider>`. If we import
// from a relative path here, tsup bundles a SECOND copy of the
// context into the lottie chunk and `useTimeline` can't see the
// provider consumers mounted — which produces a white screen
// ("useTimeline must be used inside <TimelineProvider>"). The
// main package is externalized in tsup.config so the host resolves
// this import to the already-loaded main bundle at runtime.
import { useTimeline } from '@arinze-clinton/loupe';

/**
 * Options for {@link useLoupeLottie}.
 */
export type UseLoupeLottieOptions = {
  /**
   * URL or `path:` of the Lottie JSON. Passed through to lottie-web's
   * `loadAnimation({ path })` / `loadAnimation({ animationData })`.
   * Either `src` or `data` must be provided.
   */
  src?: string;
  /**
   * Inlined Lottie JSON (parsed object). Takes precedence over `src`
   * when both are set.
   */
  data?: unknown;
  /**
   * The DOM node lottie-web mounts into. Typically a `<div>` ref's
   * current value. If null, the hook is a no-op until a real
   * element is passed on a later render.
   */
  container: HTMLElement | null;
  /**
   * Lottie renderer. Canvas gives you an `HTMLCanvasElement` you
   * can composite against (the conic-mask case); SVG gives
   * per-path DOM you can annotate. Default: `'svg'`.
   */
  renderer?: 'svg' | 'canvas' | 'html';
  /**
   * The native frame rate of the Lottie. Needed to translate the
   * TimelineProvider's `time` (ms) into a lottie frame number.
   * Default: `24`. If wrong, scrubbing will feel sped up or
   * slowed down relative to playback.
   */
  fps?: number;
  /**
   * Total frame count of the Lottie animation. If omitted, the
   * hook reads it from the loaded animation (`anim.totalFrames`)
   * after `DOMLoaded`. Setting it explicitly avoids a one-frame
   * flash of frame 0 before sync kicks in.
   */
  totalFrames?: number;
  /**
   * Whether to wrap the frame pointer at the loop boundary. Default
   * `true` — Loupe loops phases on its own, but this guards against
   * out-of-range time values (e.g. during dev-panel scrubbing past
   * the end). Set to `false` if you want the lottie to clamp at
   * the last frame instead of wrapping.
   */
  loop?: boolean;
  /**
   * Additional renderer settings forwarded to lottie-web
   * (`loadAnimation({ rendererSettings })`). Useful for canvas
   * `clearCanvas`, `preserveAspectRatio`, etc.
   */
  rendererSettings?: Record<string, unknown>;
};

export type UseLoupeLottieResult = {
  /** The underlying lottie-web `AnimationItem`, once loaded.
   *  Null until DOMLoaded fires. */
  anim: AnimationItem | null;
};

/**
 * Mount a lottie-web animation whose frame pointer is driven by the
 * nearest `TimelineProvider`'s `time` MotionValue.
 *
 * When Loupe plays, the hook seeks the Lottie frame-by-frame. When
 * Loupe is paused, the Lottie freezes on the current frame. Scrubbing
 * the Loupe panel scrubs the Lottie like a native Lottie previewer.
 *
 * The lottie-web animation is loaded with `autoplay: false` — its
 * internal clock is never used. All motion comes from Loupe's time,
 * so every consumer (video thumbnails, still renders via Remotion,
 * etc.) stays deterministic.
 *
 * @example
 * ```tsx
 * function Mark() {
 *   const hostRef = useRef<HTMLDivElement | null>(null);
 *   useLoupeLottie({
 *     src: '/brand/blend.json',
 *     container: hostRef.current,
 *     fps: 24,
 *     totalFrames: 121,
 *   });
 *   return <div ref={hostRef} style={{ width: 220, height: 220 }} />;
 * }
 * ```
 *
 * @remarks
 * `lottie-web` is an optional peer dependency. Install it in your
 * app separately: `npm i lottie-web`.
 */
export function useLoupeLottie(
  opts: UseLoupeLottieOptions,
): UseLoupeLottieResult {
  const animRef = useRef<AnimationItem | null>(null);
  const totalFramesRef = useRef<number>(opts.totalFrames ?? 0);
  const { time } = useTimeline();

  // Load lottie-web dynamically so the runtime package stays
  // lottie-free at import time. Consumers that don't touch the
  // /lottie subpath never pay for lottie-web.
  useEffect(() => {
    const container = opts.container;
    if (!container) return;
    let cancelled = false;
    let anim: AnimationItem | null = null;

    (async () => {
      const { default: lottie } = await import('lottie-web');
      if (cancelled) return;
      anim = lottie.loadAnimation({
        container,
        renderer: opts.renderer ?? 'svg',
        loop: true,
        autoplay: false,
        ...(opts.data !== undefined
          ? { animationData: opts.data }
          : { path: opts.src }),
        rendererSettings: opts.rendererSettings ?? {},
      });
      animRef.current = anim;

      // If totalFrames wasn't given, read it once the JSON loads so
      // the ms→frame math is accurate from the first real seek.
      const onReady = () => {
        if (anim && !opts.totalFrames) {
          totalFramesRef.current = anim.totalFrames;
        }
        // Snap to whatever the current time says right now so we
        // don't briefly flash frame 0 before the first subscriber
        // tick fires.
        if (anim) {
          const frame = computeFrame(
            time.get(),
            opts.fps ?? 24,
            totalFramesRef.current || anim.totalFrames,
            opts.loop !== false,
          );
          anim.goToAndStop(frame, true);
        }
      };
      anim.addEventListener('DOMLoaded', onReady);
    })();

    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.container, opts.src, opts.data]);

  // Drive the frame pointer from Loupe's time MotionValue.
  useMotionValueEvent(time, 'change', (ms) => {
    const anim = animRef.current;
    if (!anim) return;
    const total = totalFramesRef.current || anim.totalFrames;
    if (!total) return;
    const frame = computeFrame(ms, opts.fps ?? 24, total, opts.loop !== false);
    anim.goToAndStop(frame, true);
  });

  return { anim: animRef.current };
}

/**
 * ms → lottie frame, respecting wrap vs. clamp.
 * Pulled out so the initial-seek path and the change handler share
 * the same math (and don't drift if we change one and forget the
 * other).
 */
function computeFrame(
  ms: number,
  fps: number,
  total: number,
  loop: boolean,
): number {
  const rawFrame = (ms / 1000) * fps;
  if (!loop) {
    if (rawFrame < 0) return 0;
    if (rawFrame > total - 1) return total - 1;
    return rawFrame;
  }
  const wrapped = ((rawFrame % total) + total) % total;
  return wrapped;
}
