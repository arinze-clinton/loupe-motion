import { createPortal } from 'react-dom';
import { TimelineProvider } from '../runtime/TimelineProvider';
import { useTimeline } from '../runtime/TimelineProvider';
import { useSceneRootRef } from '../runtime/registry';
import { PaperScene, PAPER_SCENE_PHASES, PAPER_SCENE_DURATION_MS } from '../scenes/PaperScene';

/**
 * A built-in demo scene Loupe can mount from the empty-panel state's
 * "Try the sample" button. Uses the SAME paper-slide animation the
 * onboarding modal shows — so what the user just watched is exactly
 * the thing they get to scrub, pick, and annotate.
 */

const ACCENT = 'var(--loupe-accent, #3A97F9)';
const PANEL_BG = 'var(--loupe-panel-bg, rgba(18, 20, 25, 0.96))';
const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
const PANEL_MUTED = 'var(--loupe-panel-muted, #9BA3AF)';
const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255, 255, 255, 0.08))';
const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';

export const SAMPLE_SCENE_ID = 'loupe:sample';

const SAMPLE_PHASE_DURATIONS = PAPER_SCENE_PHASES.reduce<Record<string, number>>(
  (acc, p) => {
    acc[p.id] = p.end - p.start;
    return acc;
  },
  {},
);
const SAMPLE_PHASE_LABELS = PAPER_SCENE_PHASES.reduce<Record<string, string>>(
  (acc, p) => {
    acc[p.id] = p.label;
    return acc;
  },
  {},
);
const SAMPLE_PHASE_ORDER = PAPER_SCENE_PHASES.map((p) => p.id);

export function SampleScene({ onDismiss }: { onDismiss: () => void }) {
  if (typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            // Sits BELOW the picker overlay (z 9998) so the overlay
            // can intercept hover/click for picking the sample card's
            // pieces. Still above page content.
            zIndex: 9500,
            pointerEvents: 'none',
            fontFamily: FONT,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <TimelineProvider
            config={{
              id: SAMPLE_SCENE_ID,
              label: 'Sample · Paper slide',
              phaseOrder: SAMPLE_PHASE_ORDER,
              phaseDurations: SAMPLE_PHASE_DURATIONS,
              phaseLabels: SAMPLE_PHASE_LABELS,
            }}
          >
            <SampleCard />
          </TimelineProvider>
        </div>,
        document.body,
      )}
      {/* Stop chip lives in its OWN portal so it can sit ABOVE the
          picker overlay (z 9998). It's tagged data-loupe-ui so the
          picker still skips it — the chip can't be picked, but it
          remains clickable mid-pick. */}
      {createPortal(
        <SampleControlChip onDismiss={onDismiss} />,
        document.body,
      )}
    </>
  );
}

/**
 * The chip + Stop button are Loupe's own chrome — tag them with
 * `data-loupe-ui` so the picker skips them. The sample card itself
 * stays untagged so designers can pick the paper, circle, and cross.
 */
function SampleControlChip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      data-loupe-ui
      style={{
        // Positioned just below the centered card. Roughly: viewport
        // midpoint + half-card-height + gap. The exact pixel doesn't
        // matter — visual alignment with the card is what reads.
        position: 'fixed',
        top: 'calc(50% + 130px)',
        left: '50%',
        transform: 'translateX(-50%)',
        // Above the picker overlay (9998) so Stop stays clickable
        // mid-pick. The chip is tagged data-loupe-ui so the picker
        // still excludes it from element resolution.
        zIndex: 10050,
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
  const { time } = useTimeline();

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      style={{
        // Card opts back into hit-testing so the picker can find
        // descendants. The registry also auto-patches this to `auto`
        // on registration as a safety net.
        pointerEvents: 'auto',
        padding: 16,
        borderRadius: 18,
        background: PANEL_BG,
        color: PANEL_FG,
        border: `1px solid ${PANEL_BORDER}`,
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
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
          alignSelf: 'flex-start',
        }}
      >
        Sample · Paper slide
      </div>
      <PaperScene time={time} />
      <div style={{ fontSize: 12, color: PANEL_MUTED, alignSelf: 'flex-start' }}>
        Scrub the timeline · pick the paper, circle, or cross.
      </div>
    </div>
  );
}
