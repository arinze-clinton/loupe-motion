# API reference

## App-root components

### `<LoupeRegistryProvider>`

Wraps your app and collects every `<TimelineProvider>` mounted beneath it. Required if you want the panel to drive scenes.

```tsx
<LoupeRegistryProvider>
  <App />
</LoupeRegistryProvider>
```

### `<AnnotationsProvider>`

Manages the active scene's annotation list. Reads `activeSceneId` from the registry and switches lists when the user picks a new scene.

```tsx
<LoupeRegistryProvider>
  <AnnotationsProvider>
    <App />
  </AnnotationsProvider>
</LoupeRegistryProvider>
```

### `<LoupePanel>`

The floating dev UI. Renders at the bottom of the viewport. Drag to move; position persists in `localStorage`.

### `<AnnotationOverlay>`

Full-viewport interaction layer used during element/region picking and draft editing. Render alongside `<LoupePanel>`.

### `<AnnotationPins>`

Numbered pins for every saved annotation. Element pins follow their selector; region pins anchor to the region's top-right corner. Right-click to delete.

## Scene components

### `<TimelineProvider config={...}>`

Owns the time axis for one scene. Must be mounted to use any of the scene-level hooks.

```tsx
type SceneConfig = {
  id: string;                                          // unique
  label: string;                                       // shown in picker
  phaseOrder: readonly string[];                       // e.g. ['idle', 'enter', 'hold', 'exit']
  phaseDurations: Readonly<Record<string, number>>;    // ms per phase
  phaseLabels?: Readonly<Record<string, string>>;      // optional shorter labels
};
```

## Hooks

### `useTimeline(): TimelineState`

Returns the active scene's timeline state.

```tsx
type TimelineState = {
  sceneId: string;
  sceneLabel: string;
  ranges: PhaseRange[];        // computed from phaseDurations
  totalDuration: number;       // sum of all phase durations
  phaseOrder: readonly string[];
  time: MotionValue<number>;   // the global time axis
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  seek: (ms: number) => void;
  restart: () => void;
};
```

### `useTimelineValue(from, to, options?): MotionValue<number>`

Derive an animated value between two timeline points. The most common hook you'll use.

```tsx
type UseTimelineValueOptions = {
  startMs?: number;     // absolute start time on the timeline
  endMs?: number;       // absolute end time on the timeline
  phase?: string;       // shortcut: span this whole phase
  offset?: number;      // ms within the phase before the transition begins
  duration?: number;    // overrides endMs
  ease?: EasingFunction;
};
```

```tsx
// Span the whole 'enter' phase
const opacity = useTimelineValue(0, 1, { phase: 'enter' });

// Start 200ms into 'enter', run for 500ms
const y = useTimelineValue(20, 0, { phase: 'enter', offset: 200, duration: 500 });

// Absolute timing — useful for cross-phase transitions
const x = useTimelineValue(-100, 0, { startMs: 1200, endMs: 1900 });
```

### `usePhaseFromTime(): string`

Returns the current phase name. Re-renders when the phase changes (not on every tick).

### `usePhaseEnterKey(targetPhase): number`

Returns a counter that increments each time the timeline ENTERS `targetPhase`. Use as a `key` or `playKey` on one-shot effects (Lottie animations, Web Animations) so they re-trigger on every loop pass and on scrub-past-then-forward.

### `useTimelineTime(): MotionValue<number>`

Subscribe to the raw time MotionValue. Equivalent to `useTimeline().time`.

### `useRangeOf(phase: string): PhaseRange`

Look up a phase's range from the active scene's config. Throws if phase is unknown.

```tsx
type PhaseRange = {
  phase: string;
  start: number;       // ms
  end: number;         // ms
  duration: number;    // ms
};
```

### `useSceneRootRef(): React.RefObject<HTMLElement | null>`

Get the ref the registry uses to draw the scene flash overlay when the user picks this scene from the dropdown. Attach it to your scene's outermost element.

```tsx
function HeroScene() {
  const rootRef = useSceneRootRef();
  return <section ref={rootRef}>...</section>;
}
```

### `useAnnotations(): AnnotationsState`

Access the annotation system's state and actions. Used by `<LoupePanel>` and the overlay/pins, but exposed for custom integrations.

## Curves

### `HOUSE_CURVE_FN: EasingFunction`

`cubicBezier(0.59, 0.01, 0.4, 0.98)` — calm, decisive easing with no bounce. Loupe's house default for `useTimelineValue`.

### `SETTLE_CURVE_FN: EasingFunction`

`cubicBezier(0.175, 0.885, 0.32, 1.275)` — soft settle with mild overshoot. Use for cards or modals landing into place.

## Helpers

### `computeRanges(config: SceneConfig): PhaseRange[]`

Pure function that converts a scene config into phase ranges. You rarely call this directly — `<TimelineProvider>` does it for you.

### `totalDurationFor(ranges: PhaseRange[]): number`

Sum of all phase durations.

### `rangeOf(ranges: PhaseRange[], phase: string): PhaseRange`

Look up a phase by name. Throws if unknown.

### `phaseAtTime(ranges, totalDuration, time): string`

Returns which phase is active at a given ms. Used internally by `usePhaseFromTime`.

### `annotationsToMarkdown(list: Annotation[]): string`

Serialize annotations as Markdown. The "copy feedback" button uses this.

## CLI

### `npx loupe init`

Interactive setup. Asks how to mount Loupe (auto vs manual), writes `loupe.example.tsx` with copy-paste wiring, optionally installs the Claude skill at `.claude/skills/loupe/SKILL.md`.

### `npx loupe scan [--json]`

Walk the project's source files and report animations.

Categories:
- `timeline-bound` — files importing `@arinze-clinton/loupe`
- `motion` — Framer `<motion.x animate={...}>`, `useAnimate()`, `animate()`
- `waapi` — `element.animate({...})`
- `gsap` — `gsap.to/from/timeline`
- `css-keyframes` — `@keyframes` blocks
- `css-transition` — CSS `transition:` declarations

`--json` emits machine-readable output for the Claude skill or CI pipelines.

## Theme overrides

Loupe's panel chrome reads CSS variables from the host page. Override any of these to match your brand:

```css
:root {
  --loupe-font: 'YourFont', system-ui, sans-serif;
  --loupe-accent: #3A97F9;            /* primary brand color */
  --loupe-region-accent: #A855F7;     /* region annotation color */
  --loupe-panel-bg: rgba(18, 20, 25, 0.92);
  --loupe-panel-fg: #E8EAEE;
  --loupe-panel-muted: #9BA3AF;
  --loupe-panel-border: rgba(255, 255, 255, 0.08);
  --loupe-panel-highlight: #EAF3FF;
}
```
