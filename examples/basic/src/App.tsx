import {
  AnnotationOverlay,
  AnnotationPins,
  AnnotationsProvider,
  LoupePanel,
  LoupeRegistryProvider,
} from '@arinze-clinton/loupe';

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
        <LoupePanel />
        <AnnotationOverlay />
        <AnnotationPins />
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}
