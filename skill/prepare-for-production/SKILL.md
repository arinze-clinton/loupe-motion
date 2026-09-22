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

1. **Find the scene id.** Locate the `<TimelineProvider>` and read `config.id`. If the
   project has more than one scene and the request is ambiguous, ask which.
2. **Get the facts. Run `npx loupe resolve --scene <id> --json` and use its output —
   do not compute timing yourself.** Loupe does the phase arithmetic and hands back,
   per value: `kind` (`"value"` eased, or `"spring"`), `resolvedStartMs` /
   `resolvedEndMs` (absolute ms), `from` / `to`, the driven `property`, the
   `component`, the `line`, and `zeroLength`. Eased values carry `ease` (control
   points) and `easeName`; springs carry `bounce`. Every value is either
   `convertible: true` with those fields, or `convertible: false` with a `refuse` code
   and a `reason` — those are the ones you must not guess (see the refusal table). This
   is the honesty boundary: if `resolve` didn't resolve it, you don't invent it.
3. **Identify the library** — Framer values, the GSAP adapter, the WAAPI adapter,
   Lottie, or raw `useTransform`. This decides how you *write* each fact; `resolve`
   already gave you the numbers. (GSAP and WAAPI keep their timing inside the build
   function — `resolve` reports their `useTimelineValue` calls if any, but their
   conversion is structural, below.)
4. **Ask where it goes.** Which file, and whether it replaces an existing animation or
   lands fresh. Never choose a destination yourself.
5. **Convert**, including stripping the scene wrapper.
6. **Write it** where they said.
7. **Report** — what converted, what `resolve` refused and why, and how to check.

If `resolve` can't run (older Loupe, or it reports `scene-config-not-found`), fall back
to computing the timing yourself with the model in *Timing arithmetic — reference*
below. Prefer `resolve`; it is tested against the real hooks and you are not.

Convert milliseconds to seconds for Framer (`resolvedStartMs / 1000`), and pass
`ease` through as the control-point array `resolve` gave you. When `zeroLength` is
true, emit `duration: 0` so Framer doesn't invent its ~0.3s default fade.

## Timing arithmetic — reference

You normally get this from `resolve`. Kept here for the fallback case and so you can
sanity-check a number.

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

`resolve` flags both. If computing by hand:

- **`start === end`** (`resolve`: `zeroLength: true`) — the value hard-steps. Emit
  `duration: 0`. Omitting it makes Framer apply its ~0.3s default and invent a fade
  that was never there.
- **`start > end`** (`resolve`: `refuse: 'inverted-window'`) — the value plays
  backwards. **Stop and report.** Never emit a negative duration.

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

## Converting — springs (`kind: "spring"`)

A resolved spring carries `from`/`to`, its `resolvedStartMs`/`resolvedEndMs` window, and
`bounce`. In Framer it converts to a spring transition — same `initial`/`animate`, but
the transition is `type: 'spring'` with the window's duration and the bounce:

\`\`\`tsx
// resolve: { kind:'spring', from:60, to:0, resolvedStartMs:0, resolvedEndMs:600, bounce:0.45, property:'y' }
<motion.div
  initial={{ y: 60 }}
  animate={{ y: 0 }}
  transition={{ type: 'spring', duration: 0.6, bounce: 0.45, delay: 0 }}
/>
\`\`\`

`duration` is `(resolvedEndMs − resolvedStartMs) / 1000`, `delay` is
`resolvedStartMs / 1000`. These are Framer's own `{ type:'spring', duration, bounce }`
params, the same ones Loupe sampled the timeline value from — so the production spring
matches what you tuned, exactly. Do **not** convert a spring to an eased `cubic-bezier`;
you'd lose the overshoot. Multiple spring values on one element get per-property spring
transitions, same as the eased case.

(React Native / Reanimated target: a spring becomes `withSpring(to, { duration, dampingRatio })`
where `dampingRatio ≈ 1 − bounce`. Full Reanimated table lands with the native adapter.)

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

## Strip the scene wrapper — only when every value converted

**If `resolve` refused even one value in the scene, do NOT strip the wrapper.** A
refused value still calls `useTimelineValue` and still needs its clock, so
`@arinze-clinton/loupe` and `<TimelineProvider>` have to stay. Watch for the cascade:
if component A is fed a value from a refused hook in component B, A can't convert
either. In that case this is a **partial conversion** — convert the values that
resolved, leave everything else exactly as-is, keep the wrapper, and say clearly in
your report that the scene can't lose its timeline dependency until the refused values
are reworked (and how — give a literal `phase` instead of an index, split a conditional
so `from`/`to` are literals, etc.). A half-stripped scene that breaks the un-converted
rows is worse than an honest partial.

When **every** value converted, "no timeline dependency" means the
`@arinze-clinton/loupe` import is gone. The conversion rules above don't achieve that on
their own:

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

Most of these `resolve` flags for you as a `refuse` code (shown in the middle column);
a few are structural and `resolve` can't see them, so you must catch those yourself.

| Case | `resolve` code | What to do |
|---|---|---|
| Conditional `from`/`to` — e.g. `reduce ? 1 : 0` | `conditional-from-to` | Keep the conditional in the output. Don't collapse it to one branch. |
| Non-literal `phase` — a variable, prop, or computed key | `non-literal-phase` | Resolve **per rendered instance**, not per call site. One call site rendered N times with an index-derived phase has N different delays. Never apply one instance's timing to all of them. |
| Hand-written easing function (not `cubicBezier`) | `unknown-easing` | Stop. Report it. Offer to keep the import, or to sample it into keyframe stops — the user's choice. |
| `from`/`to`/option from props, state, or computed expressions | `computed-value` / `computed-option` | Stop. Don't inline a value you observed at one moment. |
| Inverted window (`start > end`) | `inverted-window` | Stop. Never emit a negative duration. |
| Phase name not in `phaseOrder` | `unknown-phase` | Stop — the timing can't be resolved. |
| Scene config not in the same file / not a literal | `scene-config-not-found` | Run `resolve` where the `<TimelineProvider>` lives, or read the config and compute by hand. |
| `useTransform` not reading the timeline's `time`, or non-numeric output | *(not flagged)* | Out of scope. Refuse. |
| `usePhaseEnterKey` / `usePhaseFromTime` | *(not flagged)* | Stop. They exist to re-fire one-shot effects each loop pass; a `useEffect(…, [])` reversal loses the re-trigger, and the phase encodes a delay that has to be computed. |
| Lottie via `useLoupeLottie` | *(not flagged)* | The hook **is** the player — it hardcodes `autoplay: false, loop: true` inside `loadAnimation`. Rewrite the call; there's no wrapper to delete. |
| Destination unclear | *(not flagged)* | Ask. Never pick a path. |

The four `*(not flagged)*` rows are the ones `resolve` can't detect statically — you
own those. Everything else, trust the `refuse` code.

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
