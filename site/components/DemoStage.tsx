import { ReactNode, useEffect, useState } from 'react';
import {
  TimelineProvider,
  LoupeRegistryProvider,
  AnnotationsProvider,
  LoupePanel,
} from '@arinze-clinton/loupe';

/**
 * Reusable container for a live, contained Loupe demo. Mounts the real
 * embedded panel (the actual product driving the scrubbing) around a scene.
 * Every demo on the site is built from this, so they're all real — never a
 * mockup.
 *
 * `config` is a Loupe scene config; children are the scene's visuals and call
 * useTimelineValue / useTimelineSpring (they render inside the TimelineProvider).
 */
export type DemoStageProps = {
  config: {
    id: string;
    label: string;
    phaseOrder: readonly string[];
    phaseDurations: Record<string, number>;
  };
  children: ReactNode;
  height?: number;
};

export function DemoStage({ config, children, height = 360 }: DemoStageProps) {
  // Client-only: the panel is browser-only. Embedded mode skips the welcome
  // modal and all localStorage, so the demo opens straight on the panel.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div
      style={{
        position: 'relative',
        transform: 'translateZ(0)', // contains the panel's position:fixed
        height,
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
                paddingBottom: 144, // reserve the docked panel's zone so it never overlaps the scene
                boxSizing: 'border-box',
                background:
                  'radial-gradient(120% 120% at 50% 0%, rgba(58,151,249,0.10), transparent 60%)',
              }}
            >
              <TimelineProvider config={config}>{children}</TimelineProvider>
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

/** Shared card chrome so demo scenes look consistent. */
export function DemoCard({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: '#151922',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#E8EAEE',
        fontFamily: 'system-ui, sans-serif',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
