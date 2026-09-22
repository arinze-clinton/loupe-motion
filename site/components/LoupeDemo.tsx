import { useTimelineValue, useTimelineSpring } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';
import { DemoStage, DemoCard } from './DemoStage';

/**
 * Hero demo — a launch card that springs in, with a checkmark that settles
 * after. Built on the real embedded panel via DemoStage.
 */
const config = {
  id: 'site:hero',
  label: 'Launch card',
  phaseOrder: ['enter', 'settle'] as const,
  phaseDurations: { enter: 520, settle: 380 },
};

export function LoupeDemo() {
  return (
    <DemoStage config={config}>
      <Card />
    </DemoStage>
  );
}

function Card() {
  const y = useTimelineSpring(44, 0, { phase: 'enter', bounce: 0.42 });
  const scale = useTimelineSpring(0.9, 1, { phase: 'enter', bounce: 0.42 });
  const opacity = useTimelineValue(0, 1, { phase: 'enter', duration: 300 });
  const check = useTimelineValue(0, 1, { phase: 'settle', duration: 360 });

  return (
    <motion.div style={{ y, scale, opacity }}>
      <DemoCard style={{ width: 220, display: 'flex', alignItems: 'center', gap: 12 }}>
        <motion.span
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: 999,
            background: 'rgba(58,151,249,0.18)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <motion.svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: check }}>
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#3A97F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </motion.span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Timeline-first</div>
          <div style={{ fontSize: 12, color: '#9BA3AF', marginTop: 2 }}>scrub the panel below ↓</div>
        </div>
      </DemoCard>
    </motion.div>
  );
}
