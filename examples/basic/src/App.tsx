import {
  AnnotationOverlay,
  AnnotationPins,
  AnnotationsProvider,
  LoupePanel,
  LoupeRegistryProvider,
  useLoupeRegistry,
} from '@arinze-clinton/loupe';
import { GsapDemo } from './GsapDemo';

// Opt-in demo scenes for exercising the adapters. The default
// playground stays empty (first-install onboarding state); add
// `?demo=gsap` to the URL to mount the GSAP adapter smoke test.
const demo =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('demo')
    : null;

/**
 * Playground entry point.
 *
 * Intentionally has NO `<TimelineProvider>` mounted — that mirrors a
 * real first-install: the designer has installed Loupe but hasn't
 * wired up any animations yet. They should see the welcome modal
 * over the empty-panel state, with the "Try the sample" button as
 * the way in.
 */
export function App() {
  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        {demo === 'gsap' ? <GsapDemo /> : <Placeholder />}
        <LoupePanel />
        <AnnotationOverlay />
        <AnnotationPins />
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}

/**
 * "your app" empty-state copy. Hidden while the built-in sample is
 * running so the sample animation takes the center of the screen
 * unobstructed — same mental model as the onboarding demo.
 */
function Placeholder() {
  const { scenes } = useLoupeRegistry();
  const sampleActive = scenes.some((s) => s.id === 'loupe:sample');
  if (sampleActive) return null;
  return (
    <main
      style={{
        minHeight: '100%',
        padding: 48,
        display: 'grid',
        placeItems: 'center',
        color: '#9BA3AF',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>
          your app
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.5 }}>
          Imagine this is your React app. Loupe is installed, but no
          animations are wired up yet.
        </div>
      </div>
    </main>
  );
}
