# Getting started

This guide walks you from `npm install` to a scrubbing animation in about five minutes. If you'd rather have an AI agent do the wiring, run `npx loupe init` and let the bundled Claude skill take over.

## 1. Install

```bash
npm install @arinze-clinton/loupe -D
```

Loupe declares `react`, `react-dom`, and `framer-motion` as peers — it'll use the versions already installed in your project.

## 2. Mount Loupe at the root

Open your app's root file (usually `App.tsx` or `main.tsx`) and wrap your app:

```tsx
import {
  LoupeRegistryProvider,
  AnnotationsProvider,
  LoupePanel,
  AnnotationOverlay,
  AnnotationPins,
} from '@arinze-clinton/loupe';

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== 'production';

export function App() {
  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        <YourApp />
        {isDev && (
          <>
            <LoupePanel />
            <AnnotationOverlay />
            <AnnotationPins />
          </>
        )}
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}
```

`LoupeRegistryProvider` collects every scene that mounts beneath it. `AnnotationsProvider` switches its annotation list based on the active scene. The dev-only fragment renders the floating panel + the picker overlay + the saved pins.

If you want Loupe somewhere other than dev (a `?loupe=1` URL flag, a hotkey toggle, a feature flag), just swap `isDev` for whatever boolean you want.

## 3. Wrap an animated scene in `<TimelineProvider>`

A scene is anything you'd review as a single piece of motion — a hero, a card reveal, a multi-step modal. Each scene gets a unique id and a list of named phases.

```tsx
import { TimelineProvider } from '@arinze-clinton/loupe';

function HeroScene() {
  return (
    <TimelineProvider
      config={{
        id: 'hero',
        label: 'Hero',
        phaseOrder: ['idle', 'enter', 'hold', 'exit'],
        phaseDurations: { idle: 400, enter: 600, hold: 1200, exit: 500 },
      }}
    >
      <HeroContent />
    </TimelineProvider>
  );
}
```

The phases tell a story: `idle` → `enter` → `hold` → `exit`. Loupe's panel will show them as clickable segments on the strip.

## 4. Drive your animations from `time`

Inside the scene, animate with `useTimelineValue`. Every animated property becomes a function of the timeline.

```tsx
import { motion } from 'framer-motion';
import { useTimelineValue } from '@arinze-clinton/loupe';

function HeroContent() {
  const opacity = useTimelineValue(0, 1, { phase: 'enter' });
  const y = useTimelineValue(20, 0, { phase: 'enter' });

  return (
    <motion.h1 style={{ opacity, y }}>
      Welcome
    </motion.h1>
  );
}
```

That's it. Run your dev server. The Loupe panel appears at the bottom of the page. Pick "Hero" from the dropdown if you have multiple scenes mounted. Scrub. Pause. Annotate.

## 5. Annotate as you go

Click the pointer icon in the Loupe panel → click any element on the page → write a note. Click `copy feedback` and paste it straight into your AI agent's chat. Each annotation includes the component name, source file:line, selector, phase, and exact ms position — everything the agent needs to find the code and reproduce the moment.

## What's next

- See [the timeline-first pitch](timeline-first.md) for why this pattern matters.
- See [refactoring fire-and-forget animations](refactoring-to-timeline.md) if you have existing animations to migrate.
- See [API reference](api.md) for every export Loupe ships.
