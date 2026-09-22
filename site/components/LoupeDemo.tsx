import { useEffect, useState } from 'react';
import {
  TimelineProvider,
  useTimelineValue,
  useTimelineSpring,
  LoupeRegistryProvider,
  AnnotationsProvider,
  LoupePanel,
} from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';

/**
 * A contained, REAL Loupe demo — the actual LoupePanel driving the scrubbing,
 * not a stand-in control. What the visitor uses here is exactly what they'd
 * use in their own project.
 *
 * Containment trick: LoupePanel is `position: fixed`. A `transform` on this
 * wrapper makes fixed descendants resolve to the wrapper instead of the
 * viewport, so the panel sits inside the demo box rather than floating over
 * the whole page.
 */

const config = {
  id: 'site:hero',
  label: 'Launch card',
  phaseOrder: ['enter', 'settle'] as const,
  phaseDurations: { enter: 520, settle: 380 },
};

export function LoupeDemo() {
  // Client-only: the panel is browser-only. Embedded mode skips the welcome
  // modal and all localStorage, so the demo opens straight on the panel.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div
      style={{
        position: 'relative',
        transform: 'translateZ(0)', // contains the panel's position:fixed
        height: 400,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(120,120,130,0.25)',
        background: '#0d0f13',
        margin: '20px 0',
      }}
    >
      {ready ? (
        <LoupeRegistryProvider>
          <AnnotationsProvider>
            <div
              style={{
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                background:
                  'radial-gradient(120% 120% at 50% 0%, rgba(58,151,249,0.10), transparent 60%)',
              }}
            >
              <TimelineProvider config={config}>
                <Card />
              </TimelineProvider>
            </div>
            <LoupePanel embedded />
          </AnnotationsProvider>
        </LoupeRegistryProvider>
      ) : (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#9BA3AF' }}>
          Loading demo…
        </div>
      )}
    </div>
  );
}

function Card() {
  const y = useTimelineSpring(44, 0, { phase: 'enter', bounce: 0.42 });
  const scale = useTimelineSpring(0.9, 1, { phase: 'enter', bounce: 0.42 });
  const opacity = useTimelineValue(0, 1, { phase: 'enter', duration: 300 });
  const check = useTimelineValue(0, 1, { phase: 'settle', duration: 360 });

  return (
    <motion.div
      style={{
        y,
        scale,
        opacity,
        width: 220,
        padding: 20,
        borderRadius: 12,
        background: '#151922',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#E8EAEE',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
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
    </motion.div>
  );
}
