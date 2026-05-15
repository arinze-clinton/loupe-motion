import { cubicBezier, motion, useTransform, type MotionValue } from 'framer-motion';
import { forwardRef } from 'react';

/**
 * PaperScene — the paper-slide-up-with-cross-draw illustration that
 * appears in both the onboarding modal (driven by a local time motion
 * value) and the built-in `<SampleScene>` (driven by Loupe's TimelineProvider).
 *
 * Keeping a single component for both means the thing the user sees in
 * onboarding is exactly what they get to scrub / pick / annotate when
 * they click "Try the sample." No recognition gap.
 *
 * Time is in milliseconds. Total length: 1500ms.
 *   - 0–500ms: paper slides up from below the circular frame.
 *   - 400–1100ms: cross strokes draw on the paper (overlaps with the slide
 *     so motion feels continuous; opacity fades in over 400–550 so the
 *     round linecaps don't render as dots before length is visible).
 */

const ACCENT = 'var(--loupe-accent, #3A97F9)';
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

export const PAPER_SCENE_DURATION_MS = 1500;
export const PAPER_SCENE_PHASES = [
  { id: 'slide', label: 'Slide', start: 0, end: 500 },
  { id: 'draw', label: 'Draw', start: 500, end: 1500 },
] as const;

export const PaperScene = forwardRef<
  HTMLDivElement,
  { time: MotionValue<number>; showHighlight?: boolean }
>(function PaperScene({ time, showHighlight = false }, ref) {
  const paperY = useTransform(time, [0, 500], [120, 0], { clamp: true, ease: EASE_OUT });
  const crossPathLength = useTransform(time, [400, 1100], [0, 1], {
    clamp: true,
    ease: EASE_OUT,
  });
  const crossOpacity = useTransform(time, [400, 550], [0, 1], {
    clamp: true,
    ease: EASE_OUT,
  });

  return (
    <div ref={ref} style={{ position: 'relative', width: 150, height: 150 }}>
      {/* Circular frame — overflow:hidden clips the paper while it slides up. */}
      <div
        data-loupe-pickable="frame"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #E3ECFA 0%, #DAE7FF 100%)',
          borderRadius: 9999,
          overflow: 'hidden',
        }}
      >
        {/* Paper group — pulled from Figma node 619:145736, positioned at
            (30, 37) inside the 150x150 frame. */}
        <motion.svg
          data-loupe-pickable="paper"
          viewBox="0 0 90 113"
          width={90}
          height={113}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', left: 30, top: 37, y: paperY }}
        >
          <path
            d="M90 111C90 112.105 89.1046 113 88 113H2C0.89543 113 0 112.105 0 111V17.9978C0 16.8941 0.897541 16.0119 1.99251 15.8734C5.49952 15.4298 8.78245 13.8345 11.3084 11.3085C13.8344 8.78247 15.4298 5.49952 15.8734 1.99251C16.0119 0.897542 16.8941 0 17.9978 0H71.9957C73.102 0 73.9851 0.901504 74.1219 1.99925C74.2982 3.41388 74.6644 4.80141 75.213 6.12378C76.0182 8.06478 77.2003 9.82685 78.691 11.308C80.1721 12.7991 81.9342 13.9816 83.8754 14.787C85.198 15.3357 86.5857 15.7019 88.0006 15.8782C89.0984 16.0149 90 16.8981 90 18.0044V111Z"
            fill="white"
          />
          <path
            d="M45 65C58.2548 65 69 54.2548 69 41C69 27.7452 58.2548 17 45 17C31.7452 17 21 27.7452 21 41C21 54.2548 31.7452 65 45 65Z"
            fill="#4285F4"
          />
          <motion.path
            d="M35.1186 31.1187L54.8814 50.8815"
            stroke="white"
            strokeWidth={4}
            strokeLinecap="round"
            style={{ pathLength: crossPathLength, opacity: crossOpacity }}
          />
          <motion.path
            d="M54.8814 31.1187L35.1186 50.8815"
            stroke="white"
            strokeWidth={4}
            strokeLinecap="round"
            style={{ pathLength: crossPathLength, opacity: crossOpacity }}
          />
          <path
            d="M58 71H32C30.3431 71 29 72.3431 29 74C29 75.6569 30.3431 77 32 77H58C59.6569 77 61 75.6569 61 74C61 72.3431 59.6569 71 58 71Z"
            fill="#DFEAFB"
          />
          <path
            d="M67 83H23C21.3431 83 20 84.3431 20 86C20 87.6569 21.3431 89 23 89H67C68.6569 89 70 87.6569 70 86C70 84.3431 68.6569 83 67 83Z"
            fill="#DFEAFB"
          />
        </motion.svg>
      </div>

      {showHighlight && (
        <motion.div
          aria-hidden
          style={{
            position: 'absolute',
            left: 30 - 3,
            top: 37 - 3,
            width: 90 + 6,
            height: 113 + 6,
            y: paperY,
            borderRadius: 5,
            border: `1.5px solid ${ACCENT}`,
            boxShadow:
              '0 0 0 3px rgba(58, 151, 249, 0.14), 0 0 18px rgba(58, 151, 249, 0.22)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
});
