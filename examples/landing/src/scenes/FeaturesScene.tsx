import { SceneRoot, TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';
import { tokens } from '../tokens';

const config = {
  id: 'harbor:schedule',
  label: 'Schedule drop',
  phaseOrder: ['drop1', 'drop2', 'drop3', 'rest'] as const,
  phaseDurations: { drop1: 700, drop2: 700, drop3: 700, rest: 1600 },
};

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Drop = {
  phase: 'drop1' | 'drop2' | 'drop3';
  dayIndex: number;
  label: string;
  color: string;
};

const drops: Drop[] = [
  { phase: 'drop1', dayIndex: 1, label: 'Tweet thread', color: tokens.color.blue },
  { phase: 'drop2', dayIndex: 2, label: 'Email blast', color: tokens.color.accent },
  { phase: 'drop3', dayIndex: 4, label: 'Newsletter', color: tokens.color.purple },
];

export function ScheduleScene() {
  return (
    <TimelineProvider config={config}>
      <CalendarMock />
    </TimelineProvider>
  );
}

function CalendarMock() {
  return (
    <SceneRoot
      style={{
        background: tokens.color.panelLight,
        borderRadius: tokens.radius.lg,
        padding: tokens.space.lg,
        width: '100%',
        maxWidth: 720,
        boxShadow: '0 24px 60px -32px rgba(20, 17, 15, 0.4)',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: tokens.color.inkSubtle,
          marginBottom: tokens.space.md,
        }}
      >
        This week
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: tokens.space.xs,
          position: 'relative',
        }}
      >
        {days.map((day, i) => (
          <DayCell key={day} day={day} drop={drops.find((d) => d.dayIndex === i)} />
        ))}
      </div>
    </SceneRoot>
  );
}

function DayCell({ day, drop }: { day: string; drop?: Drop }) {
  return (
    <div
      style={{
        background: tokens.color.canvas,
        border: `1px solid ${tokens.color.hairline}`,
        borderRadius: tokens.radius.md,
        padding: tokens.space.sm,
        height: 140,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: tokens.color.inkSubtle,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
        }}
      >
        {day}
      </div>
      {drop && <DropCard drop={drop} />}
    </div>
  );
}

function DropCard({ drop }: { drop: Drop }) {
  const y = useTimelineValue(-80, 0, { phase: drop.phase, duration: 500 });
  const opacity = useTimelineValue(0, 1, { phase: drop.phase, duration: 300 });
  const scale = useTimelineValue(0.92, 1, { phase: drop.phase, duration: 600 });

  return (
    <motion.div
      style={{
        y,
        opacity,
        scale,
        marginTop: 'auto',
        background: drop.color,
        color: '#fff',
        borderRadius: tokens.radius.sm,
        padding: '8px 10px',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.3,
      }}
    >
      {drop.label}
    </motion.div>
  );
}
