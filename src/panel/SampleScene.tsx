import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { TimelineProvider } from '../runtime/TimelineProvider';
import { useTimelineValue } from '../runtime/hooks';
import { useSceneRootRef } from '../runtime/registry';

/**
 * A built-in demo scene Loupe can mount from the empty-panel state's
 * "Try the sample" button. Gives the designer a real, live scene to
 * drive without having to wire one up in their own app first.
 *
 * Visually: a small labeled card portaled into a top-center floating
 * region, so it doesn't disturb the user's content underneath.
 */

const ACCENT = 'var(--loupe-accent, #3A97F9)';
const PANEL_BG = 'var(--loupe-panel-bg, rgba(18, 20, 25, 0.96))';
const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
const PANEL_MUTED = 'var(--loupe-panel-muted, #9BA3AF)';
const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255, 255, 255, 0.08))';
const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';

export const SAMPLE_SCENE_ID = 'loupe:sample';

export function SampleScene({ onDismiss }: { onDismiss: () => void }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-loupe-ui
      style={{
        position: 'fixed',
        top: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10040,
        pointerEvents: 'none',
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <SampleControlChip onDismiss={onDismiss} />
      <TimelineProvider
        config={{
          id: SAMPLE_SCENE_ID,
          label: 'Sample scene',
          phaseOrder: ['enter', 'settle', 'rest'],
          phaseDurations: { enter: 600, settle: 600, rest: 400 },
          phaseLabels: { enter: 'Enter', settle: 'Settle', rest: 'Rest' },
        }}
      >
        <SampleCard />
      </TimelineProvider>
    </div>,
    document.body,
  );
}

/**
 * Small Loupe-branded pill that sits above the sample card. It's
 * visually tethered to the card (proximity), wears Loupe colours
 * (continuity), and uses the word "Stop" rather than an × icon
 * (so it can't be mistaken for a notification-dismiss control).
 */
function SampleControlChip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 4px 4px 12px',
        background: PANEL_BG,
        color: PANEL_FG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 999,
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: 999,
          background: ACCENT,
          boxShadow: `0 0 0 3px rgba(58, 151, 249, 0.18)`,
        }}
      />
      <span style={{ color: PANEL_MUTED, fontWeight: 500 }}>Loupe Sample</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'rgba(255,255,255,0.08)',
          color: PANEL_FG,
          border: 'none',
          borderRadius: 999,
          padding: '4px 10px',
          fontFamily: 'inherit',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Stop
      </button>
    </div>
  );
}

function SampleCard() {
  const ref = useSceneRootRef();
  const opacity = useTimelineValue(0, 1, { phase: 'enter' });
  const y = useTimelineValue(20, 0, { phase: 'enter' });
  const scale = useTimelineValue(0.94, 1, { phase: 'enter' });

  return (
    <motion.div
      ref={ref as React.Ref<HTMLDivElement>}
      style={{
        opacity,
        y,
        scale,
        pointerEvents: 'auto',
        width: 280,
        padding: '14px 16px',
        borderRadius: 14,
        background: PANEL_BG,
        color: PANEL_FG,
        border: `1px solid ${PANEL_BORDER}`,
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: ACCENT,
          fontWeight: 700,
        }}
      >
        Sample · Loupe
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>New message</div>
      <div style={{ fontSize: 12, color: PANEL_MUTED }}>
        Drag the scrubber to scrub me.
      </div>
    </motion.div>
  );
}
