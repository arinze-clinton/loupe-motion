<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo.svg" alt="Loupe" width="200">
</picture>

<br>

[![release](https://img.shields.io/github/v/release/arinze-clinton/loupe-motion?display_name=tag)](https://github.com/arinze-clinton/loupe-motion/releases)
[![license](https://img.shields.io/badge/license-private-orange)](#license)

**Loupe** is a timeline-first motion authoring tool for React. Scrub your animations, annotate frames inline, and export structured feedback your AI coding agent can act on.

## Install

```bash
npm install @arinze-clinton/loupe -D
npx loupe init
```

`loupe init` walks you through wiring the panel into your app and installs the bundled Claude skill so you can talk to Loupe in plain English from your editor.

## Usage

```tsx
import {
  LoupeRegistryProvider,
  LoupePanel,
} from '@arinze-clinton/loupe';
import '@arinze-clinton/loupe/styles.css';

function App() {
  return (
    <LoupeRegistryProvider>
      <YourApp />
      {import.meta.env.DEV && <LoupePanel />}
    </LoupeRegistryProvider>
  );
}
```

Wrap any animated scene in `<TimelineProvider>` and Loupe picks it up automatically.

```tsx
import { TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';

function MyScene() {
  return (
    <TimelineProvider
      config={{
        id: 'my-scene',
        label: 'My Scene',
        phaseOrder: ['idle', 'enter', 'hold', 'exit'],
        phaseDurations: { idle: 400, enter: 600, hold: 1200, exit: 500 },
      }}
    >
      <FadingBox />
    </TimelineProvider>
  );
}

function FadingBox() {
  const opacity = useTimelineValue(0, 1, { phase: 'enter' });
  return <motion.div style={{ opacity }}>Hello</motion.div>;
}
```

## Features

- **Scrub any registered scene** — pause, seek, restart, and play at 0.25× to 4× speed
- **Phase strip** — every named phase is a clickable segment with proportional width
- **Element annotations** — click any element on a paused frame and leave a note
- **Region annotations** — draw a box around an empty area and leave a note there
- **Markdown export** — one click copies all annotations as structured Markdown your AI agent can parse
- **Multi-scene panel** — one floating UI controls every scene on the page; pick from a dropdown, the picked scene flashes
- **Persistent layout** — drag the panel anywhere; position survives reloads
- **Mobile-aware** — collapses to a compact two-row layout under 640px
- **CLI scanner** — `npx loupe scan` reports which animations are timeline-bound and which need refactoring
- **Claude skill bundled** — `loupe init` writes a skill into `.claude/skills/` so the agent understands timeline-first motion

## How it works

Loupe is built around one idea: every motion is a function of `time`. Time is the single source of truth — a shared `MotionValue` advanced by `requestAnimationFrame`. Scrubbing back is just `time.set(0)`. Pausing is just clearing the frame loop. Reviewing your animation feels like reviewing a video edit, not poking at a black box.

Every `<TimelineProvider>` registers itself with the app-root `LoupeRegistryProvider`. The floating panel reads the active scene's state and drives it. Annotations are stored per-scene in `localStorage` and exported as Markdown for your AI agent.

## Requirements

- React 18+
- Framer Motion 11+
- Modern desktop or mobile browser

## Docs

- [Getting started](docs/getting-started.md)
- [The timeline-first pitch](docs/timeline-first.md)
- [Refactoring fire-and-forget animations](docs/refactoring-to-timeline.md)
- [API reference](docs/api.md)

## License

Private to the Arinze Clinton team. Not licensed for external use.
