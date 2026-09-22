import { SceneRoot, TimelineProvider, useTimelineSpring, useTimelineValue } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';

/**
 * Spring adapter smoke test. Mount with `?demo=spring`.
 *
 * A card springs up + scales in with a visible bounce, alongside an eased
 * fade for contrast. Scrub it: the spring overshoots past its target and
 * settles, all driven by the shared clock — same scrub, pause, rewind as any
 * eased value.
 */
const config = {
  id: 'demo:spring',
  label: 'Spring demo',
  phaseOrder: ['enter'] as const,
  phaseDurations: { enter: 700 },
};

export function SpringDemo() {
  return (
    <TimelineProvider config={config}>
      <main style={{ minHeight: '100%', display: 'grid', placeItems: 'center' }}>
        <Card />
      </main>
    </TimelineProvider>
  );
}

function Card() {
  const y = useTimelineSpring(60, 0, { phase: 'enter', bounce: 0.45 });
  const scale = useTimelineSpring(0.8, 1, { phase: 'enter', bounce: 0.45 });
  const opacity = useTimelineValue(0, 1, { phase: 'enter', duration: 260 });

  return (
    <SceneRoot
      style={{
        width: 260,
        padding: 28,
        borderRadius: 18,
        background: '#151922',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#E8EAEE',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <motion.div data-spring-card style={{ y, scale, opacity }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Spring</div>
        <div style={{ fontSize: 13, color: '#9BA3AF', marginTop: 6 }}>
          Scrub me — I overshoot and settle.
        </div>
      </motion.div>
    </SceneRoot>
  );
}
