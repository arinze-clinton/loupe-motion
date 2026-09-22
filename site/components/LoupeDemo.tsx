import { useEffect, useState } from 'react';
import {
  TimelineProvider,
  useTimelineValue,
  useTimelineSpring,
  useTimeline,
} from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';

/**
 * A contained, REAL Loupe demo — not a mockup. An actual TimelineProvider
 * scene with an inline scrubber bound to the real clock, so the visitor
 * scrubs the same timeline the tool drives. This is the reusable primitive
 * the docs demos are built from.
 */

const config = {
  id: 'site:hero',
  label: 'Hero',
  phaseOrder: ['enter', 'settle'] as const,
  phaseDurations: { enter: 520, settle: 380 },
};

export function LoupeDemo() {
  return (
    <TimelineProvider config={config}>
      <Stage />
    </TimelineProvider>
  );
}

function Stage() {
  const y = useTimelineSpring(44, 0, { phase: 'enter', bounce: 0.42 });
  const scale = useTimelineSpring(0.9, 1, { phase: 'enter', bounce: 0.42 });
  const opacity = useTimelineValue(0, 1, { phase: 'enter', duration: 300 });
  const check = useTimelineValue(0, 1, { phase: 'settle', duration: 360 });

  return (
    <div
      style={{
        border: '1px solid var(--loupe-demo-border, rgba(120,120,130,0.25))',
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--loupe-demo-bg, #0d0f13)',
        margin: '20px 0',
      }}
    >
      <div
        style={{
          height: 260,
          display: 'grid',
          placeItems: 'center',
          background:
            'radial-gradient(120% 120% at 50% 0%, rgba(58,151,249,0.10), transparent 60%)',
        }}
      >
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
            <div style={{ fontSize: 12, color: '#9BA3AF', marginTop: 2 }}>scrub me below →</div>
          </div>
        </motion.div>
      </div>
      <Scrubber />
    </div>
  );
}

function Scrubber() {
  const { time, seek, setPaused, paused, totalDuration } = useTimeline();
  const [t, setT] = useState(0);

  useEffect(() => {
    const unsub = time.on('change', (v: number) => setT(v));
    return unsub;
  }, [time]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0c10',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        style={{
          width: 34,
          height: 30,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'transparent',
          color: '#E8EAEE',
          cursor: 'pointer',
          fontSize: 13,
        }}
        aria-label={paused ? 'Play' : 'Pause'}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(totalDuration))}
        value={Math.round(t)}
        onChange={(e) => {
          setPaused(true);
          seek(Number(e.target.value));
        }}
        style={{ flex: 1, accentColor: '#3A97F9' }}
        aria-label="Scrub the timeline"
      />
      <span style={{ fontSize: 12, color: '#9BA3AF', width: 92, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(t)} / {Math.round(totalDuration)}ms
      </span>
    </div>
  );
}
