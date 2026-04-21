# Refactoring fire-and-forget animations

You have a project full of `<motion.x animate={...}>` and `gsap.to()` calls. Loupe's scanner found them. Here's how to refactor them so Loupe can scrub them — without changing how they look.

## Step 0 — find them

```bash
npx loupe scan
```

You'll see output like:

```
Summary
  timeline-bound          0
  framer-motion (FF)     19
  WAAPI                   0
  GSAP                    0
  CSS @keyframes          2
  CSS transition          2
```

Categorize before you refactor:
- **Authored, sequenced motion** (entrance animations, modal reveals, choreographed loops) → refactor
- **State-driven UI feedback** (hover, focus, drag) → leave alone
- **Spinners, indicators, ambient loops** → leave alone unless they're part of a story

## Pattern 1 — Framer Motion `<motion.x animate={...}>`

**Before:**
```tsx
<motion.div
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, delay: 0.2 }}
/>
```

**After:**
```tsx
const opacity = useTimelineValue(0, 1, { phase: 'enter', offset: 200, duration: 500 });
const y = useTimelineValue(20, 0, { phase: 'enter', offset: 200, duration: 500 });

<motion.div style={{ opacity, y }} />
```

The visible behavior is identical. The difference: instead of the animation kicking off when the component mounts, it's derived from `time` advancing through the `enter` phase. Mount/unmount no longer matter — scrubbing back to `time = 0` resets the visual state automatically.

## Pattern 2 — `useAnimate` from Framer Motion

**Before:**
```tsx
const [scope, animate] = useAnimate();
useEffect(() => {
  animate(scope.current, { opacity: 1 }, { duration: 0.5 });
}, []);
```

**After:** drop the `useAnimate` entirely, replace with a `useTimelineValue` styled into the element. Same as pattern 1.

## Pattern 3 — WAAPI (`element.animate`)

WAAPI is the easiest to migrate because it already exposes `currentTime`:

**Before:**
```tsx
useEffect(() => {
  el.current?.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: 500, delay: 200, fill: 'forwards' }
  );
}, []);
```

**After:** use `useTimelineValue` for the simple cases (same as pattern 1), or — if you have complex multi-keyframe WAAPI animations you want to preserve — drive `currentTime` from a timeline subscription:

```tsx
const animation = useRef<Animation | null>(null);
useEffect(() => {
  if (!el.current) return;
  animation.current = el.current.animate(keyframes, {
    duration: 500,
    fill: 'forwards',
  });
  animation.current.pause();
}, []);

useTimelineEvent('change', (ms) => {
  if (!animation.current) return;
  const start = 200; // matches the old `delay: 200`
  animation.current.currentTime = Math.max(0, Math.min(500, ms - start));
});
```

## Pattern 4 — GSAP

GSAP timelines map cleanly to Loupe phases. Each `.to()` becomes a `useTimelineValue` whose `startMs`/`endMs` matches the original GSAP position.

**Before:**
```tsx
const tl = gsap.timeline();
tl.to(el, { opacity: 1, duration: 0.5 });
tl.to(el, { y: 0, duration: 0.6 }, '-=0.2');
```

**After:**
```tsx
// Phase: 'enter', duration 900ms (500 + 400 of overlap-adjusted)
const opacity = useTimelineValue(0, 1, { startMs: 0,   endMs: 500 });
const y       = useTimelineValue(20, 0, { startMs: 300, endMs: 900 });
```

The math: GSAP's `'-=0.2'` means "start 200ms before the previous tween ends." Translate to absolute ms on your phase's timeline.

## Pattern 5 — CSS `@keyframes`

The hardest case. Browsers own the keyframe clock — there's no way to scrub them. You have two choices:

### Option A — convert to WAAPI, then drive from timeline

```css
/* Before */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
.hero { animation: fade-up 500ms ease-out 200ms forwards; }
```

```tsx
/* After: rewrite as WAAPI, drive currentTime from timeline (see pattern 3) */
const keyframes = [
  { opacity: 0, transform: 'translateY(20px)' },
  { opacity: 1, transform: 'translateY(0)' },
];
// ... see pattern 3
```

### Option B — rewrite as Framer Motion `useTimelineValue`

Same shape as pattern 1. Often cleaner if the animation is already on a React-rendered element.

## Pattern 6 — CSS `transition: opacity 0.3s`

If the transition fires on a state change (hover, class toggle), **leave it alone** — it's correctly fire-and-forget.

If the transition fires on mount or scroll, refactor it to a Framer transform (pattern 1).

## Sanity check

After each refactor, run `loupe scan` again. The number of `timeline-bound` files should go up; fire-and-forget should go down. When the only fire-and-forget findings left are state-driven UI feedback, you're done.

## Don't

- **Don't refactor everything in one PR.** Migrate scene-by-scene, verify each one looks identical, commit, move on.
- **Don't change visual output as a side effect.** If a refactor changes timing by 50ms because you got lazy with `offset`, your animation is now wrong. Match exactly.
- **Don't refactor without phase names that mean something.** `phase1`, `phase2`, `phase3` is worse than no refactor. Use names that read like a story.
