import { useTimelineValue, useTimelineSpring } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';
import { DemoStage } from './DemoStage';

/**
 * Spring vs ease, side by side on ONE timeline. Both dots travel 0→220px
 * over the same phase; scrub slowly and the spring overshoots and settles
 * while the eased dot glides straight in. Same clock, two feels.
 */
const config = {
  id: 'site:spring-vs-ease',
  label: 'Spring vs ease',
  phaseOrder: ['enter'] as const,
  phaseDurations: { enter: 900 },
};

export function SpringVsEaseDemo() {
  return (
    <DemoStage config={config} height={320}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 320 }}>
        <Track label="spring" spring />
        <Track label="ease" />
      </div>
    </DemoStage>
  );
}

function Track({ label, spring = false }: { label: string; spring?: boolean }) {
  const eased = useTimelineValue(0, 220, { phase: 'enter' });
  const sprung = useTimelineSpring(0, 220, { phase: 'enter', bounce: 0.5 });
  const x = spring ? sprung : eased;

  return (
    <div>
      <div style={{ fontSize: 11, color: '#9BA3AF', fontFamily: 'system-ui', marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          position: 'relative',
          height: 30,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <motion.div
          style={{
            x,
            position: 'absolute',
            top: 3,
            left: 3,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: spring ? '#3A97F9' : '#9BA3AF',
          }}
        />
      </div>
    </div>
  );
}
