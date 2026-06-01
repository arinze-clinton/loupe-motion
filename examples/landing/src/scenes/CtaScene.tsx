import { SceneRoot, TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';
import { tokens } from '../tokens';

const config = {
  id: 'harbor:insights',
  label: 'Insights',
  phaseOrder: ['grow', 'notify', 'rest'] as const,
  phaseDurations: { grow: 1100, notify: 500, rest: 1700 },
};

const bars = [38, 62, 48, 80, 56, 92, 70];
const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function InsightsScene() {
  return (
    <TimelineProvider config={config}>
      <InsightsCard />
    </TimelineProvider>
  );
}

function InsightsCard() {
  return (
    <SceneRoot
      style={{
        position: 'relative',
        background: tokens.color.panelLight,
        borderRadius: tokens.radius.lg,
        padding: tokens.space.lg,
        width: 380,
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
          }}
        >
          Signups, last 7 days
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: tokens.color.ink,
          }}
        >
          1,284
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: tokens.space.xs,
          height: 140,
          alignItems: 'end',
        }}
      >
        {bars.map((value, i) => (
          <Bar key={i} index={i} value={value} />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: tokens.space.xs,
          marginTop: tokens.space.sm,
        }}
      >
        {dayLabels.map((d, i) => (
          <div
            key={i}
            style={{
              fontSize: 11,
              color: tokens.color.inkSubtle,
              textAlign: 'center',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      <NotificationToast />
    </SceneRoot>
  );
}

function Bar({ index, value }: { index: number; value: number }) {
  const total = bars.length;
  const offset = (index / total) * 700;
  const scaleY = useTimelineValue(0, 1, {
    phase: 'grow',
    duration: 500,
    offset,
  });
  return (
    <motion.div
      style={{
        scaleY,
        originY: 1,
        height: `${value}%`,
        background:
          index === bars.length - 2
            ? tokens.color.accent
            : tokens.color.accentSoft,
        borderRadius: 6,
      }}
    />
  );
}

function NotificationToast() {
  const y = useTimelineValue(-12, 0, { phase: 'notify', duration: 400 });
  const opacity = useTimelineValue(0, 1, { phase: 'notify', duration: 300 });
  const scale = useTimelineValue(0.96, 1, { phase: 'notify', duration: 400 });

  return (
    <motion.div
      style={{
        y,
        opacity,
        scale,
        position: 'absolute',
        top: -14,
        right: 16,
        background: tokens.color.panelDark,
        color: tokens.color.inkOnDark,
        borderRadius: tokens.radius.pill,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.xs,
        boxShadow: '0 8px 24px -8px rgba(20, 17, 15, 0.35)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: tokens.color.success,
          display: 'inline-block',
        }}
      />
      234 new signups today
    </motion.div>
  );
}
