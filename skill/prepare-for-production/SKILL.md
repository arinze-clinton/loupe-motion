---
name: loupe-prepare-for-production
description: Use when the user has finished tweaking an animation in Loupe and wants a production version with no timeline dependency. Triggers on "prepare this for production", "ship this animation", "hand this off", "export the animation", "remove the timeline", "production version of this scene", "give this to my colleague".
---

# Prepare a Loupe animation for production

Loupe binds an animation to a shared clock so it can be scrubbed. That binding is
scaffolding. When the user is done tweaking, your job is to hand back the same
animation with the scaffolding removed, written where they tell you to put it.

The Loupe version stays the master copy. What you produce is a build output — the user
regenerates and replaces it rather than editing it.

**The one rule that matters: never invent a number.** If you can't resolve a value
honestly, stop and say so. A silently wrong duration is worse than no conversion,
because the user won't catch it — they'll ship it.

## Steps

1. **Find the scene.** Locate the `<TimelineProvider>` and read its `config`. If the
   project has more than one scene and the request is ambiguous, ask which.
2. **Identify the library** — Framer values, the GSAP adapter, the WAAPI adapter,
   Lottie, or raw `useTransform`. Step 3 only applies to Framer and raw
   `useTransform`; GSAP and WAAPI keep their timing inside the build function.
3. **Resolve the timing** for each animated value (see *Timing*).
4. **Ask where it goes.** Which file, and whether it replaces an existing animation or
   lands fresh. Never choose a destination yourself.
5. **Convert**, including stripping the scene wrapper.
6. **Write it** where they said.
7. **Report** — what converted, what you refused and why, and how to check.

## Timing

A `useTimelineValue` call resolves to a window:

```
phase given:   start = phaseStart + (offset ?? 0)
               end   = duration !== undefined ? start + duration : phaseEnd
no phase:      start = startMs ?? 0
               end   = endMs ?? (duration !== undefined ? start + duration : totalDuration)
```

`phaseStart` is the sum of `phaseDurations` for the entries **listed in `phaseOrder`**
before the target phase, counting a missing key as 0. Do not sum
`Object.values(phaseDurations)` — that's wrong whenever the object carries a key
`phaseOrder` doesn't list.

Two traps:

- When `duration` is omitted, `offset` is **not** added to the end. The window runs to
  `phaseEnd`.
- The JSDoc says `duration` "overrides endMs". The code gives **`endMs` priority**.
  Follow the code.

Worked example with `{ phaseOrder: ['enter','settle'], phaseDurations: { enter: 600, settle: 400 } }`:

```tsx
useTimelineValue(0, 1, { phase: 'settle', offset: 100, duration: 200 })
// settle starts at 600 → window is 700ms → 900ms
```

### Guard these two windows

- **`start === end`** — the value hard-steps. Emit `duration: 0`. Omitting it makes
  Framer apply its ~0.3s default and invent a fade that was never there. Causes
  include a phase in `phaseOrder` with no duration entry, an explicit `duration: 0`,
  and `startMs === endMs`.
- **`start > end`** — the value plays backwards. **Stop and report.** Never emit a
  negative duration. Causes include an `offset` larger than the phase with no
  `duration` set, a negative `duration`, and `endMs` below `startMs`.

## Curves

`ease` defaults to `HOUSE_CURVE_FN` when the call doesn't pass one. **Always emit an
explicit `ease`.** A transition with a `duration` and no `ease` uses Framer's own
default, which is not the curve the user tuned against — the animation will look
different and they may not notice until it ships.

| Source | Control points |
|---|---|
| `HOUSE_CURVE_FN` (and the default) | `[0.59, 0.01, 0.4, 0.98]` |
| `SETTLE_CURVE_FN` | `[0.175, 0.885, 0.32, 1.275]` |
| `cubicBezier(a, b, c, d)` | `[a, b, c, d]` |
| Anything else | Refuse — see the table |

The array form is valid in Framer and as a CSS `cubic-bezier()`.

## Converting — Framer Motion

```tsx
// Timeline-bound
const opacity = useTimelineValue(0, 1, { phase: 'enter', offset: 200, duration: 500 });
<motion.div style={{ opacity }} />

// Production
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.2, duration: 0.5, ease: [0.59, 0.01, 0.4, 0.98] }}
/>
```

Milliseconds become seconds. Framer holds at `initial` before the delay and at
`animate` after, which matches the hook's clamping — and it clamps the input before
easing, so overshoot curves like `SETTLE_CURVE_FN` survive intact.

Several values on one element get per-property transitions, each carrying its own
curve:

```tsx
transition={{
  opacity: { delay: 0.7, duration: 0.2, ease: [0.59, 0.01, 0.4, 0.98] },
  y:       { delay: 0.6, duration: 0.3, ease: [0.175, 0.885, 0.32, 1.275] },
}}
```

## Converting — raw `useTransform`

`useTimelineTime()` + `useTransform` is a first-class pattern, not an edge case. The
input range is already absolute milliseconds, so there's no phase arithmetic.

Two stops convert exactly like `useTimelineValue`. More than two become a keyframe
array plus normalized `times`:

```tsx
useTransform(time, [400, 550, 1100], [0, 1, 0])
// → initial={{ opacity: 0 }}
//   animate={{ opacity: [0, 1, 0] }}
//   transition={{ delay: 0.4, duration: 0.7, times: [0, 0.2143, 1], ease: [...] }}
```

```
delay    = input[0] / 1000
duration = (input[last] − input[0]) / 1000
times[i] = (input[i] − input[0]) / (input[last] − input[0])     // round to 4 decimals
```

Normalizing against `input[last]` alone **drops the delay** — input ranges rarely start
at zero. `times.length` must equal the keyframe count. `initial` is required and is the
first keyframe: without it Framer writes no inline value on first render, so the
element paints at its natural style and jumps once the animation starts. That's visible,
and worse under SSR.

A `useTransform` not reading the timeline's `time`, or with non-numeric output, is out
of scope. Refuse it.

## Converting — GSAP

The adapter never rewrote the user's GSAP. `useLoupeGsap({ build })` builds their
timeline paused and drives its playhead. Remove the wrapper and let GSAP run its own
clock:

```tsx
useEffect(() => {
  const ctx = gsap.context(() => {
    /* the same timeline body */
  }, ref);
  return () => ctx.revert();
}, [/* the adapter's deps */]);
```

Carry across rather than assume:

- A real `import { gsap } from 'gsap'` — the adapter passed `gsap` in as a parameter,
  so the build body's parameter name may be anything.
- The adapter's `deps`, not a hardcoded `[]`.
- `scope` was `ref.current`; `gsap.context` takes the **ref itself**.
- If the consumer reads the returned `{ timeline }`, that binding has to survive.

## Converting — WAAPI

Same shape. Call `element.animate(...)` with the same keyframes and options — **and
cancel on teardown**:

```tsx
useEffect(() => {
  const anim = el.current?.animate(keyframes, options);
  return () => anim?.cancel();
}, [/* deps */]);
```

The adapter cancels for a reason. Without it, StrictMode's double-invoke leaves two
composited animations on the element, and every remount adds another.

## Playback — read it, don't assume it

For **Framer** scenes, Loupe's loop is a review artifact. Production plays once on
mount. Say so in your report; if it should loop, the user will tell you.

For **GSAP and WAAPI** it is not an artifact. Both adapters take a `loop` option that
**defaults to true**, and each wraps at the *animation's own* duration, not the scene's
— a 1.2s GSAP timeline inside a 3s scene runs two and a half times per pass.

- `loop: false` in the source is an explicit clamp. Honor it silently.
- Default, or `loop: true`, is a real repeat. Surface it and ask.

GSAP's infinite repeat is **`repeat: -1`**. `repeat: Infinity` is Framer's spelling and
is not valid GSAP.

## Strip the scene wrapper

"No timeline dependency" means the `@arinze-clinton/loupe` import is gone. The
conversion rules above don't achieve that on their own.

- `<TimelineProvider>` — pure scaffolding. Remove it and its config object.
- `<SceneRoot>` — **not** an inert wrapper. It emits `data-loupe-scene-root`, takes an
  `as` prop for the element type, and applies `pointerEvents`. Replace it with that
  same element (`as` if given, otherwise `div`), carrying the consumer's style and
  props across.

  **Pointer-events needs a decision, not a default.** With no Loupe mounted,
  `SceneRoot` renders `pointer-events: none` unless the scene set it explicitly. That's
  right for a decorative overlay and wrong for anything with a button in it. So:

  - Scene set `pointerEvents` explicitly → carry that value across. It's already a
    deliberate choice.
  - Scene said nothing → **ask** whether it's decorative. Carrying `none` silently
    kills a scene with interactive content; dropping it makes a decorative overlay
    start eating clicks on whatever sits underneath. Both failures are invisible until
    someone tries to click. Do not pick for them.

`usePhaseEnterKey` and `usePhaseFromTime` are **not** on this list. Do not strip them —
see the table.

## Refuse to guess

| Case | What to do |
|---|---|
| Conditional `from`/`to` — e.g. `reduce ? 1 : 0` | Keep the conditional in the output. Don't collapse it to one branch. |
| Non-literal `phase` — a variable, prop, or computed key | Resolve **per rendered instance**, not per call site. One call site rendered N times with an index-derived phase has N different delays. Never apply one instance's timing to all of them. |
| Hand-written easing function (not `cubicBezier`) | Stop. Report it. Offer to keep the import, or to sample it into keyframe stops — the user's choice. |
| `from`/`to` from props, state, or computed expressions | Stop. Don't inline a value you observed at one moment. |
| Inverted window (`start > end`) | Stop. Never emit a negative duration. |
| `useTransform` not reading the timeline's `time`, or non-numeric output | Out of scope. Refuse. |
| `usePhaseEnterKey` / `usePhaseFromTime` | Stop. They exist to re-fire one-shot effects each loop pass; a `useEffect(…, [])` reversal loses the re-trigger, and the phase encodes a delay that has to be computed. |
| Lottie via `useLoupeLottie` | The hook **is** the player — it hardcodes `autoplay: false, loop: true` inside `loadAnimation`. Rewrite the call; there's no wrapper to delete. |
| Scene config that isn't a literal object | Stop — the timing can't be resolved statically. |
| Destination unclear | Ask. Never pick a path. |

Convert what's convertible, leave the rest untouched, and say plainly what you left.

## Report

End with what you did, what you didn't, and how to check:

```
Done. Replaced the motion block at Hero.tsx:23. Three values converted.

Left alone:
  • `opacity` reads `reduce ? 1 : 0` — kept the conditional rather than
    baking in a value.

Plays once on mount — say so if it should loop.

To check: scrub `hero-entrance` to 320ms in Loupe and compare.
```

That last line is the point. Both versions run the same motion at the same moment, so
they should look identical. It gives the user — and you — a way to confirm the
conversion instead of trusting it.
