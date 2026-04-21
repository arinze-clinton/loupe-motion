---
name: loupe
description: Use when the user wants to scrub, annotate, or review React animations, when they mention Loupe, when they ask to refactor animations to be timeline-bound, or when they install/configure @arinze-clinton/loupe. Triggers on phrases like "make this scrubbable", "audit my animations", "loupe init", "loupe scan", "wire up Loupe".
---

# Loupe — timeline-first motion authoring

You are helping the user work with **Loupe** (`@arinze-clinton/loupe`), a dev-time tool for scrubbing, pausing, and annotating React animations against a deterministic timeline. Time is the single source of truth — every motion is a function of `time`, expressed via Framer Motion's `MotionValue` and `useTransform`.

## What Loupe gives the user

- A floating panel with scrub, pause, restart, speed (0.25× – 4×)
- Per-phase clickable segments (the "phase strip")
- Element + region annotations with auto-captured DOM selector, React component name, source file:line, and timeline position
- One-click Markdown export of all annotations — paste straight into chat
- Multi-scene support — one panel drives every `<TimelineProvider>` on the page

## Mental model — timeline-first

Most React animation is **fire-and-forget**: you call `animate()`, the browser runs it, you can't pause, can't scrub, can't reason about it as a whole. Loupe's idea is the opposite:

```tsx
// Fire-and-forget — Loupe can't see this.
<motion.div animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />

// Timeline-bound — Loupe owns this.
const opacity = useTimelineValue(0, 1, { phase: 'enter' });
<motion.div style={{ opacity }} />
```

The second style works because `time` is a `MotionValue` advanced by a single `requestAnimationFrame` loop in `<TimelineProvider>`. Scrubbing back is `time.set(0)`. Pausing is clearing the loop. Every frame is reproducible.

## Commands the user invokes

### `loupe init`

The user is wiring Loupe into a fresh project. This command:
1. Asks how Loupe should mount (auto vs manual)
2. Writes `loupe.example.tsx` at the repo root
3. Optionally installs this skill

If asked to do this manually, tell them: `npx loupe init`.

### `loupe scan`

Walks the project's `.ts/.tsx/.js/.jsx/.css/.scss` files and reports animations. Use `loupe scan --json` for machine-readable output — that's what *you* should call when reviewing the project.

Findings:
- `timeline-bound` — files importing `@arinze-clinton/loupe` (good)
- `motion` — `<motion.x animate={...}>` or `useAnimate()` (fire-forget)
- `waapi` — `element.animate({...})` (cleanest to refactor — already exposes `currentTime`)
- `gsap` — `gsap.to/from/timeline` (refactorable to GSAP timeline + Loupe registration)
- `css-keyframes` — `@keyframes` blocks (must refactor — browsers own the clock, no scrub)
- `css-transition` — `transition:` declarations (fire-forget)

## Workflows

### A. User says "audit my animations" or "set up Loupe"

1. Run `npx loupe scan --json` and read the report.
2. **If everything is `timeline-bound`**:
   > Sweep complete — every animation is timeline-bound. Loupe controls them all already. Open the dev server and you'll see the panel at the bottom of the page. Mention any specific animation you want to scrub and I'll point you at the right phase.
3. **If there are fire-and-forget animations**: present the count by category and offer to refactor. Be specific: "I see 8 fire-and-forget animations across 4 files — `Hero.tsx`, `MyScene.tsx`, etc. Want me to refactor them to be timeline-bound? I won't change visual output, just hook them onto a shared time axis."

### B. User accepts the refactor

For each fire-and-forget animation, the rough recipe is:

**Framer Motion `<motion.x animate={...}>`:**
```tsx
// Before
<motion.div animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }} />

// After
const opacity = useTimelineValue(0, 1, { phase: 'enter', offset: 200, duration: 500 });
<motion.div style={{ opacity }} />
```

**WAAPI `element.animate()`:**
WAAPI exposes `currentTime` natively. Either keep it and drive `currentTime` from a `useTimelineValue` mapped to a real ms range, or rewrite as a Framer transform.

**CSS `@keyframes`:**
The hardest case. Either:
- Convert to WAAPI (`element.animate(keyframes, { duration })`) so `currentTime` is reachable, then drive it from the timeline
- Or rewrite as a Framer Motion `useTransform`

**CSS `transition:`:**
If the property is animated by interaction (hover, focus), leave it — Loupe is for authored motion, not state-based UI feedback. If it's animating on mount/scroll, refactor to a Framer transform.

### C. User wants to add a new animation

Default to timeline-bound. Pick phase names that read like a story (`idle`, `enter`, `hold`, `exit`). Use `useTimelineValue(from, to, { phase, offset, duration, ease })` for every animated property. Wrap the scene in `<TimelineProvider>` with `id`, `label`, `phaseOrder`, `phaseDurations`. Loupe picks it up automatically once it's registered.

### D. User wants to mount Loupe somewhere new

If they have `LoupeRegistryProvider` and `AnnotationsProvider` at the root, just render `<LoupePanel />`, `<AnnotationOverlay />`, and `<AnnotationPins />` inside the gate they want (e.g. `import.meta.env.DEV`, query param, hotkey).

## Important constraints

- **Never claim a refactor preserves visual output unless you've matched timing exactly.** Phase durations + offsets must reconstruct the original animation's start/end times.
- **Don't refactor state-driven UI feedback** (hover transitions, focus rings, button presses). Those are correctly fire-and-forget. Only refactor *authored, sequenced* motion.
- **Don't auto-mount in production.** Loupe is a dev tool. The default wiring gates on `import.meta.env.DEV` for a reason.
- **One `TimelineProvider` per scene, one `LoupeRegistryProvider` per app.**

## Reference — public API

```tsx
import {
  // App root
  LoupeRegistryProvider,
  AnnotationsProvider,
  LoupePanel,
  AnnotationOverlay,
  AnnotationPins,

  // Per scene
  TimelineProvider,
  useTimeline,
  useTimelineValue,
  usePhaseFromTime,
  usePhaseEnterKey,

  // Curves
  HOUSE_CURVE_FN,
  SETTLE_CURVE_FN,

  // Types
  type SceneConfig,
  type PhaseRange,
} from '@arinze-clinton/loupe';
```

```tsx
type SceneConfig = {
  id: string;                    // unique per scene
  label: string;                 // shown in the picker dropdown
  phaseOrder: readonly string[]; // e.g. ['idle', 'enter', 'hold', 'exit']
  phaseDurations: Readonly<Record<string, number>>; // ms per phase
  phaseLabels?: Readonly<Record<string, string>>;   // optional shorter labels
};
```

```tsx
useTimelineValue(from: number, to: number, options?: {
  startMs?: number;
  endMs?: number;
  phase?: string;     // shortcut: span this whole phase
  offset?: number;    // ms within the phase before transition begins
  duration?: number;  // overrides endMs
  ease?: EasingFunction;
});
```
