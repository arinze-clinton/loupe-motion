import { useCallback, useState } from 'react';
import { TimelineProvider, useSceneRootRef } from '@arinze-clinton/loupe';
import { useLoupeGsap } from '@arinze-clinton/loupe/gsap';
import { tokens } from '../tokens';

/**
 * A GSAP-driven scene, dropped into the otherwise Framer-Motion
 * Harbor page. It exercises the `@arinze-clinton/loupe/gsap`
 * adapter in the real multi-scene context — switch to "Publish" in
 * the Loupe panel and scrub; the GSAP timeline tracks Loupe's clock
 * frame-for-frame.
 *
 * Phase durations sum to 2700ms and the GSAP timeline below ends at
 * exactly 2.7s, so the scene clock and the timeline wrap together.
 */
const config = {
  id: 'harbor:publish',
  label: 'Publish (GSAP)',
  phaseOrder: ['enter', 'channels', 'fill', 'done'] as const,
  phaseDurations: { enter: 800, channels: 800, fill: 600, done: 500 },
};

const channels = ['X', 'Email', 'In-app', 'Slack'];

export function PublishScene() {
  return (
    <TimelineProvider config={config}>
      <PublishCard />
    </TimelineProvider>
  );
}

function PublishCard() {
  // Give Loupe a real element to flash/scroll to AND use it as the
  // GSAP context scope. A state-backed callback ref re-runs the
  // build effect once the element actually attaches (a plain ref
  // wouldn't, since ref writes don't trigger a render).
  const rootRef = useSceneRootRef();
  const [scope, setScope] = useState<HTMLElement | null>(null);
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      setScope(el);
    },
    [rootRef],
  );

  useLoupeGsap({
    scope,
    deps: [scope],
    build: (gsap) => {
      const tl = gsap.timeline();
      // 0 → 0.8s : card lifts in
      tl.from('.gsap-card', {
        y: 40,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
      });
      // 0.8 → ~1.4s : channel chips stagger in
      tl.from(
        '.gsap-chip',
        { y: 16, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' },
        0.8,
      );
      // 1.6 → 2.2s : progress bar fills
      tl.fromTo(
        '.gsap-progress',
        { scaleX: 0 },
        { scaleX: 1, duration: 0.6, ease: 'power1.inOut' },
        1.6,
      );
      // 2.2 → 2.7s : "Published" badge pops
      tl.from(
        '.gsap-badge',
        { scale: 0.6, opacity: 0, duration: 0.5, ease: 'back.out(2)' },
        2.2,
      );
      return tl;
    },
  });

  return (
    <div
      ref={attach}
      className="gsap-card"
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
        <div style={{ fontSize: 13, fontWeight: 500, color: tokens.color.inkSubtle }}>
          New announcement
        </div>
        <div className="gsap-badge">
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: tokens.color.success,
              background: 'rgba(76,175,80,0.12)',
              borderRadius: tokens.radius.pill,
              padding: '4px 10px',
            }}
          >
            Published
          </span>
        </div>
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: tokens.color.ink,
          marginBottom: tokens.space.sm,
        }}
      >
        v2.4 — faster scheduling
      </div>

      <div
        style={{
          display: 'flex',
          gap: tokens.space.xs,
          flexWrap: 'wrap',
          marginBottom: tokens.space.md,
        }}
      >
        {channels.map((c) => (
          <span
            key={c}
            className="gsap-chip"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: tokens.color.ink,
              background: tokens.color.canvas,
              border: `1px solid ${tokens.color.hairline}`,
              borderRadius: tokens.radius.pill,
              padding: '6px 12px',
            }}
          >
            {c}
          </span>
        ))}
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: tokens.color.canvas,
          overflow: 'hidden',
        }}
      >
        <div
          className="gsap-progress"
          style={{
            height: '100%',
            width: '100%',
            transformOrigin: 'left',
            borderRadius: 3,
            background: tokens.color.accent,
          }}
        />
      </div>
    </div>
  );
}
