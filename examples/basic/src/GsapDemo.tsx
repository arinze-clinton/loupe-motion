import { useRef } from 'react';
import { TimelineProvider, useSceneRootRef } from '@arinze-clinton/loupe';
import { useLoupeGsap } from '@arinze-clinton/loupe/gsap';

/**
 * GSAP adapter smoke test. Mounted in the playground behind
 * `?demo=gsap` so the default empty-install onboarding state is
 * preserved. Open http://localhost:5174/?demo=gsap and scrub the
 * Loupe panel — the box should animate frame-for-frame off Loupe's
 * clock, not GSAP's own ticker.
 */

// Phase durations sum to 1600ms, matching the GSAP timeline length
// below (0.6 + 0.4 + 0.6 = 1.6s) so the loop lines up cleanly.
const GSAP_CONFIG = {
  id: 'gsap-demo',
  label: 'GSAP demo',
  phaseOrder: ['enter', 'spin', 'exit'] as const,
  phaseDurations: { enter: 600, spin: 400, exit: 600 },
};

export function GsapDemo() {
  return (
    <TimelineProvider config={GSAP_CONFIG}>
      <GsapScene />
    </TimelineProvider>
  );
}

function GsapScene() {
  // Scene root: give Loupe a real element to flash / scroll to, and
  // reuse it as the GSAP context scope so `.gsap-box` only matches
  // inside this scene.
  const rootRef = useSceneRootRef();
  const scopeRef = useRef<HTMLDivElement | null>(null);

  useLoupeGsap({
    scope: scopeRef.current,
    deps: [scopeRef.current],
    build: (gsap) => {
      const tl = gsap.timeline();
      tl.from('.gsap-box', {
        y: 60,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      })
        .to('.gsap-box', { rotate: 360, duration: 0.4, ease: 'none' })
        .to('.gsap-box', {
          y: -60,
          opacity: 0,
          duration: 0.6,
          ease: 'power2.in',
        });
      return tl;
    },
  });

  return (
    <main
      ref={(el) => {
        // Attach both refs to the same element.
        rootRef.current = el;
        scopeRef.current = el;
      }}
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        className="gsap-box"
        style={{
          width: 120,
          height: 120,
          borderRadius: 20,
          background: 'linear-gradient(135deg, #3A97F9, #8B5CF6)',
          boxShadow: '0 20px 60px rgba(58,151,249,0.4)',
        }}
      />
    </main>
  );
}
