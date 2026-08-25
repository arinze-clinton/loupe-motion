import {
  SceneRoot,
  TimelineProvider,
  useTimelineValue,
  SETTLE_CURVE_FN,
} from '@arinze-clinton/loupe';
import { motion, useReducedMotion } from 'framer-motion';
import { tokens } from '../tokens';

const config = {
  id: 'harbor:checklist',
  label: 'Launch checklist',
  phaseOrder: ['item1', 'item2', 'item3', 'item4', 'rest'] as const,
  phaseDurations: {
    item1: 700,
    item2: 700,
    item3: 700,
    item4: 700,
    rest: 1600,
  },
};

const items = [
  'Draft announcement',
  'Schedule social posts',
  'Notify existing customers',
  'Update changelog page',
];

export function HeroChecklistScene() {
  return (
    <TimelineProvider config={config}>
      <ChecklistCard />
    </TimelineProvider>
  );
}

function ChecklistCard() {
  return (
    <SceneRoot
      style={{
        background: tokens.color.panelLight,
        border: `1px solid ${tokens.color.hairline}`,
        borderRadius: tokens.radius.lg,
        padding: tokens.space.lg,
        width: 340,
        boxShadow: '0 12px 32px -16px rgba(20, 17, 15, 0.18)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: tokens.space.md,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: tokens.color.inkSubtle,
            letterSpacing: '0.2px',
          }}
        >
          Launch checklist
        </div>
        <ProgressPill />
      </div>
      {items.map((label, i) => (
        <ChecklistRow key={i} index={i} label={label} />
      ))}
    </SceneRoot>
  );
}

function ProgressPill() {
  const v1 = useTimelineValue(0, 1, { phase: 'item1' });
  const v2 = useTimelineValue(0, 1, { phase: 'item2' });
  const v3 = useTimelineValue(0, 1, { phase: 'item3' });
  const v4 = useTimelineValue(0, 1, { phase: 'item4' });
  // Use a transformed value to drive text — we'll just show a static "x of 4" derived from time elsewhere.
  // For simplicity, show "4 / 4" once everything is checked. Use opacity to fade between.
  const restOpacity = useTimelineValue(0, 1, { phase: 'item4', offset: 400, duration: 300 });
  void v1; void v2; void v3; void v4;
  return (
    <motion.div
      style={{
        opacity: restOpacity,
        background: tokens.color.accentSoft,
        color: tokens.color.accent,
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: tokens.radius.pill,
        letterSpacing: '0.2px',
      }}
    >
      Ready to ship
    </motion.div>
  );
}

function ChecklistRow({ index, label }: { index: number; label: string }) {
  const phase = (['item1', 'item2', 'item3', 'item4'] as const)[index];
  const reduce = useReducedMotion();
  const checkFill = useTimelineValue(0, 1, { phase, duration: 350 });
  const checkScale = useTimelineValue(0, 1, { phase, offset: 100, duration: 300 });
  const textOpacity = useTimelineValue(1, 0.45, { phase, duration: 400 });
  // Pop the row in as the stagger reaches it: a quick fade leads, while scale + y
  // land on Loupe's settle curve for a subtle overshoot. Collapsed under reduced motion.
  const rowOpacity = useTimelineValue(reduce ? 1 : 0, 1, { phase, duration: 220 });
  const rowScale = useTimelineValue(reduce ? 1 : 0.96, 1, {
    phase,
    duration: 320,
    ease: SETTLE_CURVE_FN,
  });
  const rowY = useTimelineValue(reduce ? 0 : 10, 0, {
    phase,
    duration: 320,
    ease: SETTLE_CURVE_FN,
  });

  return (
    <motion.div
      style={{
        opacity: rowOpacity,
        scale: rowScale,
        y: rowY,
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.sm,
        padding: '10px 0',
        borderTop:
          index === 0 ? `1px solid ${tokens.color.hairline}` : 'none',
        borderBottom: `1px solid ${tokens.color.hairline}`,
      }}
    >
      <Checkbox fill={checkFill} markScale={checkScale} />
      <motion.div
        style={{
          opacity: textOpacity,
          fontSize: 14,
          color: tokens.color.ink,
          flex: 1,
        }}
      >
        {label}
      </motion.div>
    </motion.div>
  );
}

function Checkbox({
  fill,
  markScale,
}: {
  fill: ReturnType<typeof useTimelineValue>;
  markScale: ReturnType<typeof useTimelineValue>;
}) {
  return (
    <motion.div
      style={{
        position: 'relative',
        width: 20,
        height: 20,
        borderRadius: 6,
        border: `1.5px solid ${tokens.color.hairline}`,
        background: tokens.color.panelLight,
        flexShrink: 0,
      }}
    >
      <motion.div
        style={{
          opacity: fill,
          position: 'absolute',
          inset: -1.5,
          borderRadius: 6,
          background: tokens.color.accent,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <motion.svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{ scale: markScale }}
        >
          <path
            d="M2.5 6.5L5 9L9.5 3.5"
            stroke={tokens.color.panelLight}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.div>
    </motion.div>
  );
}
