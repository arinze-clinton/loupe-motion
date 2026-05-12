import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
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
      <h1 style={titleStyle}>Loupe gives your animations a clock.</h1>
      <p style={bodyStyle}>
        Scrub them like a video. Pause on any frame. Mark what's off,
        export the notes — all on real running code, not a recording.
      </p>
    </div>
  );
}

function SlideTwo() {
  return (
    <div>
      <Eyebrow>Try it</Eyebrow>
      <h1 style={titleStyle}>Here's one running right now.</h1>
      <p style={bodyStyle}>
        Drag the scrubber. That's a real animation — every frame is
        reproducible because Loupe owns the clock.
      </p>
      <DemoScrubber />
    </div>
  );
}

function SlideThree() {
  return (
    <div>
      <Eyebrow>Last thing</Eyebrow>
      <h1 style={titleStyle}>Make your own animations scrubbable.</h1>

      <div style={pathBlockStyle}>
        <div style={pathLabelStyle}>With an AI assistant</div>
        <p style={pathBodyStyle}>
          Run <Code>loupe scan</Code> in your terminal. Your assistant
          (Claude, Cursor, Copilot) will find every animation and walk
          you through making them scrubbable, one at a time.
        </p>
      </div>

      <div style={pathBlockStyle}>
        <div style={pathLabelStyle}>Without one</div>
        <p style={pathBodyStyle}>
          Run <Code>loupe refactor</Code>. Loupe walks you through each
          animation itself — shows the before, shows the after, asks
          before changing anything.
        </p>
      </div>

      <p style={{ ...bodyStyle, fontStyle: 'italic', marginTop: 16, color: PANEL_MUTED }}>
        Either way, nothing gets refactored without your sign-off.
      </p>
    </div>
  );
}

function DemoScrubber() {
  const [paused, setPaused] = useState(false);
  const time = useMotionValue(0);
  const opacity = useTransform(time, [0, 600], [0, 1], { clamp: true });
  const scale = useTransform(time, [0, 600, 1200], [0.92, 1.02, 1], { clamp: true });
  const lift = useTransform(time, [0, 600], [12, 0], { clamp: true });
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
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          height: 120,
          borderRadius: 12,
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${PANEL_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <motion.div
          style={{
            opacity,
            scale,
            y: lift,
            width: 180,
            padding: '14px 16px',
            borderRadius: 10,
            background:
              'linear-gradient(180deg, rgba(58,151,249,0.16), rgba(58,151,249,0.04))',
            border: `1px solid ${ACCENT}`,
            color: PANEL_FG,
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 600 }}>New message</div>
          <div style={{ color: PANEL_MUTED, fontSize: 12 }}>
            Arinze sent you a file.
          </div>
        </motion.div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
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
        <span
          style={{
            fontSize: 11,
            color: PANEL_MUTED,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 42,
            textAlign: 'right',
          }}
        >
          {Math.round(progress * 100)}%
        </span>
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
