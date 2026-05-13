import {
  AnimatePresence,
  cubicBezier,
  motion,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOptionalLoupeRegistry } from '../runtime/registry';

const WELCOME_SEEN_KEY = 'loupe.welcome.seen.v1';

/**
 * Returns whether the welcome modal is currently meant to be shown.
 * Used by `LoupePanel` to render its empty state — no scene controls,
 * no active scrubber — while onboarding is happening, so the panel
 * doesn't show a "live" picker behind the dimmed overlay.
 */
export function useWelcomeOpen(): boolean {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (isForcedOpen()) return true;
    try {
      return window.localStorage.getItem(WELCOME_SEEN_KEY) !== '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => {
      if (isForcedOpen()) {
        setOpen(true);
        return;
      }
      try {
        setOpen(window.localStorage.getItem(WELCOME_SEEN_KEY) !== '1');
      } catch {
        setOpen(false);
      }
    };
    window.addEventListener('loupe-welcome-changed', check);
    return () => window.removeEventListener('loupe-welcome-changed', check);
  }, []);

  return open;
}

const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';
const ACCENT = 'var(--loupe-accent, #3A97F9)';
const PANEL_BG = 'var(--loupe-panel-bg, rgba(18, 20, 25, 0.96))';
const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
const PANEL_MUTED = 'var(--loupe-panel-muted, #9BA3AF)';
const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255, 255, 255, 0.08))';

const DEMO_DURATION_MS = 1500;

function isForcedOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('loupe_welcome') === 'force';
  } catch {
    return false;
  }
}

export function Welcome() {
  const forced = isForcedOpen();
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (forced) return true;
    try {
      return window.localStorage.getItem(WELCOME_SEEN_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);

  // Dev-time escape hatch — call from the browser console to re-show
  // the welcome without editing localStorage by hand or changing URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { __loupeResetWelcome?: () => void }).__loupeResetWelcome = () => {
      try {
        window.localStorage.removeItem(WELCOME_SEEN_KEY);
      } catch {
        /* ignore */
      }
      window.location.reload();
    };
  }, []);

  const dismiss = useCallback(() => {
    // When `?loupe_welcome=force` is in the URL, dismissal closes the
    // modal for this view but does NOT mark it seen — that way every
    // refresh re-triggers it, which is what you want while iterating.
    if (!forced) {
      try {
        window.localStorage.setItem(WELCOME_SEEN_KEY, '1');
      } catch {
        /* private mode — fine, they'll see it again next session */
      }
    }
    setOpen(false);
    // Notify `useWelcomeOpen` subscribers (the panel) so they can
    // re-render and reveal themselves now that onboarding is done.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('loupe-welcome-changed'));
    }
  }, [forced]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  // While the welcome is open, freeze every scene at frame 0 — the
  // panel stays fully alive (scrubber visible at 0%, scene picker
  // populated), but nothing autoplays behind the dimmed overlay.
  // The designer sees a still preview, not a looping distraction.
  // On dismiss, restore the user's prior paused state so we don't
  // silently overwrite their intent.
  const registry = useOptionalLoupeRegistry();
  useEffect(() => {
    if (!open || !registry) return;
    const prior = registry.scenes.map((s) => ({
      paused: s.timeline.paused,
      setPaused: s.timeline.setPaused,
      seek: s.timeline.seek,
    }));
    prior.forEach((p) => {
      p.setPaused(true);
      p.seek(0);
    });
    return () => {
      prior.forEach((p) => p.setPaused(p.paused));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="loupe-welcome"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483646,
          background: 'rgba(8, 9, 12, 0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          padding: '24px',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Loupe"
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
          style={{
            width: 'min(480px, 100%)',
            background: PANEL_BG,
            color: PANEL_FG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 20,
            boxShadow:
              '0 24px 80px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3)',
            padding: '28px 28px 22px',
          }}
        >
          {step === 0 && <SlideOne />}
          {step === 1 && <SlideTwo />}
          {step === 2 && <SlideThree />}

          <Footer
            step={step}
            onBack={() => setStep((s) => Math.max(0, s - 1))}
            onNext={() => setStep((s) => Math.min(2, s + 1))}
            onDismiss={dismiss}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function SlideOne() {
  return (
    <div>
      <Eyebrow>Welcome</Eyebrow>
      <h1 style={titleStyle}>Your web animations, on a timeline.</h1>
      <p style={bodyStyle}>
        Scrub like a video. Pause on any frame. Mark what's off,
        export the notes — all on real running code, not a recording.
      </p>
    </div>
  );
}

function SlideTwo() {
  return (
    <div>
      <Eyebrow>Try it</Eyebrow>
      <h1 style={titleStyle}>This one's real. Drag it.</h1>
      <p style={bodyStyle}>
        Scrub through to see every frame — and yes, you can leave notes
        like the one pinned on the card. Same flow with your own work.
      </p>
      <DemoScrubber />
    </div>
  );
}

function SlideThree() {
  return (
    <div>
      <Eyebrow>Now make yours scrubbable</Eyebrow>
      <h1 style={titleStyle}>Two ways in.</h1>

      <div style={pathBlockStyle}>
        <div style={pathLabelStyle}>With Claude, Cursor, or Copilot</div>
        <p style={pathBodyStyle}>
          Run <Code>loupe scan</Code>. Your assistant finds every
          animation in your project and walks you through, one at
          a time.
        </p>
      </div>

      <div style={pathBlockStyle}>
        <div style={pathLabelStyle}>No AI? No problem.</div>
        <p style={pathBodyStyle}>
          Run <Code>loupe refactor</Code>. Loupe shows you each one — the
          before, the after — and asks before changing anything.
        </p>
      </div>

      <p style={{ ...bodyStyle, fontStyle: 'italic', marginTop: 16, color: PANEL_MUTED }}>
        Either way, nothing gets refactored without your sign-off.
      </p>
    </div>
  );
}

// Phase ranges for the empty-state illustration scene. Sourced from
// the Figma node 619:145736. Two discrete designer-tweakable moments:
// the paper slide and the cross trim-path draw.
const PHASES = [
  { id: 'slide', label: 'slide', start: 0, end: 500 },
  { id: 'draw', label: 'draw', start: 500, end: 1500 },
] as const;

function activePhase(timeMs: number): (typeof PHASES)[number] {
  for (const p of PHASES) {
    if (timeMs >= p.start && timeMs < p.end) return p;
  }
  return PHASES[PHASES.length - 1];
}

// Strong ease-out from Emil's design-eng playbook — the built-in
// CSS easings feel flat; this curve gives entering motion punch and
// a proper settle at the end. Same curve used across every entering
// transform so the cascade reads as one breath.
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

function DemoScrubber() {
  const [paused, setPaused] = useState(false);
  const time = useMotionValue(0);

  // Paper — slides up from below the frame. Ease-out makes it land,
  // not stop. y goes from "fully below frame" to "resting at top 37".
  // Everything inside the paper (blue circle, text lines) rides along
  // as part of the paper; they're not animated independently anymore.
  const paperY = useTransform(time, [0, 500], [120, 0], {
    clamp: true,
    ease: EASE_OUT,
  });

  // Cross — starts drawing while the paper is still mid-slide so the
  // motion stays continuous. crossOpacity fades in over the first
  // ~150ms of the draw window — long enough for pathLength to have
  // visible length, so the round linecaps don't render as dots.
  const crossPathLength = useTransform(time, [400, 1100], [0, 1], {
    clamp: true,
    ease: EASE_OUT,
  });
  const crossOpacity = useTransform(time, [400, 550], [0, 1], {
    clamp: true,
    ease: EASE_OUT,
  });

  const [scrubbing, setScrubbing] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused || scrubbing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
      return;
    }
    const tick = (t: number) => {
      if (lastRef.current === null) lastRef.current = t;
      const dt = t - lastRef.current;
      lastRef.current = t;
      const next = (time.get() + dt) % DEMO_DURATION_MS;
      time.set(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, [paused, scrubbing, time]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    return time.on('change', () => setTick((n) => (n + 1) % 1024));
  }, [time]);
  const progress = time.get() / DEMO_DURATION_MS;

  return (
    <div
      style={{
        marginTop: 20,
        borderRadius: 12,
        overflow: 'hidden',
        background: '#0E0F12',
        border: `1px solid ${PANEL_BORDER}`,
        boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
      }}
    >
      {/* Mock browser chrome — anchors the demo as "a product on a page" */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          background: '#15171B',
          borderBottom: `1px solid ${PANEL_BORDER}`,
        }}
        aria-hidden
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#FF5F57' }} />
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#FEBC2E' }} />
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#28C840' }} />
        <span
          style={{
            flex: 1,
            marginLeft: 8,
            padding: '3px 10px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.35)',
            fontSize: 10,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          }}
        >
          loupe.dev/preview
        </span>
      </div>

      {/* Mock app content — a small interface fragment with one element
          animating in. The pin sits on the animated element so the
          "target + annotate" idea reads as a single thought. */}
      <div
        style={{
          position: 'relative',
          padding: '24px 20px',
          minHeight: 156,
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(58,151,249,0.06), rgba(0,0,0,0))',
        }}
      >
        {/* Fixed annotation — pin + note popup live OUTSIDE the
            animated scene so they don't move during scrubbing. */}
        <DemoAnnotation />

        {/* Centered illustration scene. The gradient circle is the
            frame; the paper (SVG, pulled exactly from Figma node
            619:145736) slides up from below and clips to the frame. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 16,
            paddingBottom: 8,
          }}
        >
          <div style={{ position: 'relative', width: 150, height: 150 }}>
            {/* Frame background — gradient circle, overflow:hidden
                so the paper is clipped while sliding up from below. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, #E3ECFA 0%, #DAE7FF 100%)',
                borderRadius: 9999,
                overflow: 'hidden',
              }}
            >
              {/* Paper group — translated upward into view during
                  'slide'. Positioned at (30, 37) inside the 150x150
                  frame, exactly as in Figma. */}
              <motion.svg
                viewBox="0 0 90 113"
                width={90}
                height={113}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  position: 'absolute',
                  left: 30,
                  top: 37,
                  y: paperY,
                }}
              >
                {/* Paper white shape — Subtraction 1 (Figma) */}
                <path
                  d="M90 111C90 112.105 89.1046 113 88 113H2C0.89543 113 0 112.105 0 111V17.9978C0 16.8941 0.897541 16.0119 1.99251 15.8734C5.49952 15.4298 8.78245 13.8345 11.3084 11.3085C13.8344 8.78247 15.4298 5.49952 15.8734 1.99251C16.0119 0.897542 16.8941 0 17.9978 0H71.9957C73.102 0 73.9851 0.901504 74.1219 1.99925C74.2982 3.41388 74.6644 4.80141 75.213 6.12378C76.0182 8.06478 77.2003 9.82685 78.691 11.308C80.1721 12.7991 81.9342 13.9816 83.8754 14.787C85.198 15.3357 86.5857 15.7019 88.0006 15.8782C89.0984 16.0149 90 16.8981 90 18.0044V111Z"
                  fill="white"
                />

                {/* Blue circle — Ellipse 665 (Figma). Static — rides
                    along with the paper as part of its content. */}
                <path
                  d="M45 65C58.2548 65 69 54.2548 69 41C69 27.7452 58.2548 17 45 17C31.7452 17 21 27.7452 21 41C21 54.2548 31.7452 65 45 65Z"
                  fill="#4285F4"
                />

                {/* Cross strokes — two diagonals drawn via pathLength.
                    Split into two paths so they draw simultaneously
                    rather than sequentially. */}
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

                {/* Rectangle 5617 — first text line. Static. */}
                <path
                  d="M58 71H32C30.3431 71 29 72.3431 29 74C29 75.6569 30.3431 77 32 77H58C59.6569 77 61 75.6569 61 74C61 72.3431 59.6569 71 58 71Z"
                  fill="#DFEAFB"
                />

                {/* Rectangle 5618 — second text line. Static. */}
                <path
                  d="M67 83H23C21.3431 83 20 84.3431 20 86C20 87.6569 21.3431 89 23 89H67C68.6569 89 70 87.6569 70 86C70 84.3431 68.6569 83 67 83Z"
                  fill="#DFEAFB"
                />
              </motion.svg>
            </div>

            {/* Selection highlight — surrounds the paper's bounding
                rectangle (not the circular frame around it). Follows
                the paper's y transform so it slides up with the paper
                during the 'slide' phase, exactly like Loupe's real
                picker overlay would when you select an animated DOM
                element. Lives OUTSIDE the overflow:hidden frame so
                the ring can extend past the gradient's edges if the
                paper's bounds do. */}
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
          </div>
        </div>
      </div>

      {/* Mini Loupe panel — interactive scrubber + phase strip. Shows
          the three phases of the envelope scene so the reader sees
          a real timeline structure, not just a slider. */}
      <div
        style={{
          background: PANEL_BG,
          borderTop: `1px solid ${PANEL_BORDER}`,
          padding: '8px 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            color: PANEL_MUTED,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              border: `1px solid ${PANEL_BORDER}`,
              color: PANEL_FG,
              fontWeight: 600,
              fontSize: 10,
            }}
          >
            Envelope
          </span>
          <span style={{ fontWeight: 700, color: PANEL_FG, letterSpacing: 0.2 }}>
            {activePhase(time.get()).label}
          </span>
          <span>{Math.round(time.get())}ms / {DEMO_DURATION_MS}ms</span>
          <span style={{ marginLeft: 'auto', color: PANEL_FG, fontWeight: 600 }}>
            {Math.round(progress * 100)}%
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play demo' : 'Pause demo'}
            style={iconButtonStyle}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <input
            type="range"
            min={0}
            max={DEMO_DURATION_MS}
            value={time.get()}
            onChange={(e) => {
              time.set(Number(e.target.value));
              setTick((n) => (n + 1) % 1024);
            }}
            onMouseDown={() => setScrubbing(true)}
            onMouseUp={() => setScrubbing(false)}
            onTouchStart={() => setScrubbing(true)}
            onTouchEnd={() => setScrubbing(false)}
            style={{
              flex: 1,
              accentColor: ACCENT,
              cursor: 'pointer',
            }}
            aria-label="Demo scrubber"
          />
        </div>

        {/* Phase strip — three segments sized to phase duration. The
            active segment lights up, mirroring the real panel. */}
        <div style={{ display: 'flex', gap: 3, height: 14 }}>
          {PHASES.map((p) => {
            const active = activePhase(time.get()).id === p.id;
            const widthPct = ((p.end - p.start) / DEMO_DURATION_MS) * 100;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  time.set(p.start);
                  setTick((n) => (n + 1) % 1024);
                }}
                style={{
                  flex: `0 0 ${widthPct}%`,
                  minWidth: 0,
                  height: '100%',
                  padding: 0,
                  borderRadius: 3,
                  border: 'none',
                  background: active ? ACCENT : 'rgba(255,255,255,0.06)',
                  color: active ? '#0B1220' : PANEL_MUTED,
                  fontFamily: 'inherit',
                  fontWeight: active ? 700 : 500,
                  fontSize: 9,
                  letterSpacing: 0.3,
                  cursor: 'pointer',
                  transition: 'background 150ms ease, color 150ms ease',
                }}
                aria-label={`Jump to ${p.label} phase`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Pre-placed annotation pin + note popup, positioned in fixed space
 * inside the mock content area. They DO NOT animate with the card —
 * an annotation is an observation about the animation, not part of
 * it. Visual language mirrors Loupe's real annotation: white-bordered
 * circular marker + dark panel-styled note popup with a header (the
 * targeted element + phase) and the note body.
 */
function DemoAnnotation() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 130,
        right: 260,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      {/* Note popup — mirrors AnnotationPins.tsx styling */}
      <div
        style={{
          background: 'rgba(18, 20, 25, 0.96)',
          color: PANEL_FG,
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 10,
          padding: '7px 10px',
          fontSize: 11,
          lineHeight: 1.4,
          maxWidth: 200,
          boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: '#EAF3FF',
            marginBottom: 3,
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          paper
          <span style={{ fontWeight: 500, color: PANEL_MUTED }}>· slide</span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Let's make this feel like it settles, not just stops.
        </div>
      </div>

      {/* Marker — matches the real AnnotationPins button (white border,
          accent fill, white number) but scaled down to fit the modal. */}
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          border: '2px solid #fff',
          background: ACCENT,
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        1
      </div>
    </div>
  );
}

function Footer({
  step,
  onBack,
  onNext,
  onDismiss,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
        paddingTop: 18,
        borderTop: `1px solid ${PANEL_BORDER}`,
      }}
    >
      <div style={{ display: 'flex', gap: 6 }} aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: i === step ? ACCENT : 'rgba(255,255,255,0.18)',
              transition: 'background 200ms ease',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {step > 0 && (
          <button type="button" onClick={onBack} style={secondaryButtonStyle}>
            Back
          </button>
        )}
        {step < 2 ? (
          <button type="button" onClick={onNext} style={primaryButtonStyle}>
            Next
          </button>
        ) : (
          <button type="button" onClick={onDismiss} style={primaryButtonStyle}>
            Got it, let me try
          </button>
        )}
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: ACCENT,
        marginBottom: 10,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        fontSize: '0.92em',
        padding: '1px 6px',
        borderRadius: 4,
        background: 'rgba(255, 255, 255, 0.08)',
        color: PANEL_FG,
      }}
    >
      {children}
    </code>
  );
}

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  lineHeight: 1.25,
  fontWeight: 600,
  margin: '0 0 12px',
  color: PANEL_FG,
  letterSpacing: '-0.01em',
};

const bodyStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: PANEL_FG,
  margin: 0,
};

const pathBlockStyle: React.CSSProperties = {
  marginTop: 16,
  padding: '14px 16px',
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.03)',
  border: `1px solid ${PANEL_BORDER}`,
};

const pathLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: ACCENT,
  marginBottom: 6,
};

const pathBodyStyle: React.CSSProperties = {
  ...bodyStyle,
  fontSize: 13,
};

const primaryButtonStyle: React.CSSProperties = {
  background: ACCENT,
  color: '#0B1220',
  border: 'none',
  borderRadius: 999,
  padding: '8px 16px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: PANEL_MUTED,
  border: `1px solid ${PANEL_BORDER}`,
  borderRadius: 999,
  padding: '8px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const iconButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.06)',
  border: `1px solid ${PANEL_BORDER}`,
  color: PANEL_FG,
  fontSize: 11,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
