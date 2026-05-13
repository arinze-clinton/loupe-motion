<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo.svg" alt="Loupe" width="200">
</picture>

<br>

[![npm version](https://img.shields.io/npm/v/@arinze-clinton/loupe)](https://www.npmjs.com/package/@arinze-clinton/loupe)
[![downloads](https://img.shields.io/npm/dm/@arinze-clinton/loupe)](https://www.npmjs.com/package/@arinze-clinton/loupe)
[![license](https://img.shields.io/badge/license-PolyForm%20Shield-blue)](LICENSE)

**Your web animations, on a timeline.** Scrub them like a video, pause on any frame, mark what's off, export the notes — all on real running code, not a recording.

## Quick start

```bash
npm install @arinze-clinton/loupe -D
npx loupe init
```

> Using pnpm / yarn / bun? Replace `npx` with `pnpm exec`, `yarn`, or `bun x`.

Wrap your app in one provider and mount the panel in dev:

```tsx
import { LoupeRegistryProvider, LoupePanel } from '@arinze-clinton/loupe';

function App() {
  return (
    <LoupeRegistryProvider>
      <YourApp />
      {import.meta.env.DEV && <LoupePanel />}
    </LoupeRegistryProvider>
  );
}
```

Then wrap any animated scene in a `TimelineProvider` and your motion values read from the shared clock:

```tsx
import { TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';

function MyScene() {
  return (
    <TimelineProvider
      config={{
        id: 'my-scene',
        label: 'My Scene',
        phaseOrder: ['enter', 'settle'],
        phaseDurations: { enter: 600, settle: 400 },
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

That's enough. The panel finds the scene, the scene's animations read from the shared clock, and you can scrub.

## Already got animations?

Run **`npx loupe refactor`** — Loupe walks you through each fire-and-forget animation in your project, shows the before and the after, and asks before changing anything. Nothing gets refactored without your sign-off.

Using Claude, Cursor, or Copilot? `npx loupe init` installed a skill that lets you ask in plain English: *"audit my animations"*, *"make this scrubbable"*. The agent does the same walkthrough.

## The idea

Every animation is a function of time. Loupe owns the time.

Scrubbing back is just setting time to zero. Pausing is just freezing the clock. Reviewing your animation feels like reviewing a video edit, not poking at a black box.

Once a scene is wrapped in `<TimelineProvider>`, every animated value reads from the same shared clock. The floating panel drives that clock — and lets you annotate any frame you want to change. Notes export as Markdown your AI agent (or teammate) can act on.

## CLI

| Command | What it does |
|---|---|
| `loupe init` | Wire Loupe into your project. Writes a sample scene + (optionally) installs the Claude skill. |
| `loupe scan` | Find every animation in your project and report which are timeline-bound vs fire-and-forget. |
| `loupe refactor` | Walk through each fire-and-forget animation interactively. Show-and-paste, no auto-edits. |
| `loupe check` | Print the version installed, what's declared in `package.json`, and the latest on npm. |
| `loupe uninstall` | Remove `@arinze-clinton/loupe` and the files `loupe init` wrote. Won't touch files you've edited. |

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

[PolyForm Shield 1.0.0](LICENSE) — use it freely in any project, including commercial work. You may not fork it into a competing product.
