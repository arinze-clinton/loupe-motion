import { useTimelineValue } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';
import { DemoStage, DemoCard } from './DemoStage';

/**
 * Phases — one complex animation is a single timeline split into named
 * phases. Four checklist rows tick in across item1..item4; scrub and watch
 * the stagger. The panel shows the phase you're in.
 */
const config = {
  id: 'site:phases',
  label: 'Checklist',
  phaseOrder: ['item1', 'item2', 'item3', 'item4'] as const,
  phaseDurations: { item1: 500, item2: 500, item3: 500, item4: 500 },
};

const ITEMS = ['Draft the note', 'Pick the element', 'Scrub to the frame', 'Hand off to the agent'];

export function PhasesDemo() {
  return (
    <DemoStage config={config} height={440}>
      <DemoCard style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ITEMS.map((label, i) => (
          <Row key={i} index={i} label={label} />
        ))}
      </DemoCard>
    </DemoStage>
  );
}

function Row({ index, label }: { index: number; label: string }) {
  const phase = (['item1', 'item2', 'item3', 'item4'] as const)[index];
  const fill = useTimelineValue(0, 1, { phase, duration: 300 });
  const textOpacity = useTimelineValue(0.4, 1, { phase, duration: 300 });
  const y = useTimelineValue(6, 0, { phase, duration: 320 });

  return (
    <motion.div style={{ y, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <motion.span
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          borderRadius: 6,
          border: '1.5px solid rgba(255,255,255,0.15)',
          background: 'rgba(58,151,249,0.9)',
          opacity: fill,
        }}
      />
      <motion.span style={{ opacity: textOpacity, fontSize: 13 }}>{label}</motion.span>
    </motion.div>
  );
}
