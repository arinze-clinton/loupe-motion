# Prepare for production — design

**Date:** 2026-09-17
**Status:** Approved for planning (revised after two spec-review passes)
**Scope:** One new agent skill, plus a small CLI command to deliver it.

## The problem

Loupe makes an animation scrubbable by binding it to a shared clock. That binding is
what you want while you're working and exactly what you don't want when you ship.

The real case that prompted this: one person writes an animation, a second person
pulls it into Loupe and tweaks it, commits to a branch — and then the first person
hand-converts it back to something embeddable, stripping the timeline out by hand.
Every round trip pays that tax again.

The animation is finished. The scrubbing was scaffolding. There's no way to say
"give me this without the scaffolding."

## What we're building

A skill the user invokes in plain English — *"prepare the hero animation for
production"* — that converts a timeline-bound scene back to a plain, dependency-free
animation and writes it where the user says it belongs.

The Loupe version stays the master copy. The exported version is a build output:
regenerate it and replace, don't edit it in place.

### What we are not building

No build step, bundler plugin, or codegen engine. No panel editing or write-back. No
CSS, Lottie, or video output. No new `SceneConfig` fields. No changes to how Loupe
runs today. Each of these was considered and cut; each solves a different problem.

## How it works

```
You:    prepare the hero animation for production

Agent:  Found `hero-entrance` — 4 phases, 1.6s total, Framer Motion.
        Converting to plain animate/transition. Where should this go?

You:    it replaces the hero in ../product/src/components/Hero.tsx

Agent:  Done. Replaced the motion block at Hero.tsx:23. Three values converted.
        One left alone: `opacity` reads `reduce ? 1 : 0`, so I kept the
        conditional rather than baking in a value.
        Plays once on mount — say so if it should loop.
        To check: scrub `hero-entrance` to 320ms in Loupe and compare.
```

### Steps the agent follows

1. **Locate the scene.** Find the `<TimelineProvider>` and its config. If the project
   has more than one scene and the request is ambiguous, ask which.
2. **Identify the library.** Framer values, GSAP adapter, WAAPI adapter, Lottie, or
   raw `useTransform`. Steps 3–4 branch on this — GSAP and WAAPI scenes keep their
   timing inside the build function and skip the arithmetic entirely.
3. **Resolve the timing** (Framer and raw `useTransform` only).
4. **Ask where it goes.** Destination file, and whether it replaces an existing
   animation or lands fresh. Never guess a destination.
5. **Convert**, including stripping the scene wrapper.
6. **Write it** into the destination the user named.
7. **Report.** What converted, what didn't and why, what to check.

Step 4 is what makes this a skill rather than a CLI command. The agent has the
conversation; the user never thinks about paths or formats.

## Conversion rules

### Timing arithmetic

From [hooks.ts](../../../src/runtime/hooks.ts):

```
phase given:   start = phaseStart + (offset ?? 0)
               end   = duration !== undefined ? start + duration : phaseEnd
no phase:      start = startMs ?? 0
               end   = endMs ?? (duration !== undefined ? start + duration : totalDuration)
```

`phaseStart` is the sum of `phaseDurations` for the entries **in `phaseOrder`** that
precede the target phase, treating a missing key as 0. Summing `Object.values()` gives
the wrong answer whenever the object carries keys not in `phaseOrder`.

Two traps worth stating in the skill file:

- When `duration` is omitted, `offset` is **not** added to the end — the window runs to
  `phaseEnd`.
- The JSDoc on `duration` says "overrides endMs," but the expression gives `endMs`
  priority. Follow the code, not the comment.

Worked example, config `{ phaseOrder: ['enter','settle'], phaseDurations: { enter: 600, settle: 400 } }`:

```tsx
useTimelineValue(0, 1, { phase: 'settle', offset: 100, duration: 200 })
// settle starts at 600 → window is 700ms → 900ms
```

### Framer Motion

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

**The curve is not optional.** `ease` defaults to `HOUSE_CURVE_FN`, so a converted
transition that omits it silently swaps a near-symmetric in-out for Framer's own
default. Every emitted transition carries an explicit `ease`. The forward mapping in
`skill/SKILL.md` omits it too, and should be corrected in the same change — reversing a
lossy table doesn't produce a lossless one.

Several values on one element get per-property transitions, each with its own curve:

```tsx
transition={{
  opacity: { delay: 0.7, duration: 0.2, ease: [0.59, 0.01, 0.4, 0.98] },
  y:       { delay: 0.6, duration: 0.3, ease: [0.175, 0.885, 0.32, 1.275] },
}}
```

Milliseconds become seconds. Framer holds at `initial` before the delay and at
`animate` after, which matches the hook's clamping — Framer clamps the input before
easing, so overshoot curves like `SETTLE_CURVE_FN` survive the conversion intact.

Two windows break that equivalence and need guards:

- **Zero-length — key on `start === end`.** The hook hard-steps. Emit `duration: 0`, or
  Framer applies its ~0.3s default and invents a fade that was never there. Causes
  include a phase in `phaseOrder` with no duration entry, an explicit `duration: 0`,
  and `startMs === endMs`.
- **Inverted — key on `start > end`.** The hook plays the value backwards. Stop and
  report rather than emitting a negative duration. Causes include an `offset` exceeding
  the phase duration with no `duration` set, a negative `duration`, and `endMs` below
  `startMs`.

### Raw `useTransform`

`useTimelineTime()` + `useTransform` is a documented pattern and `src/scenes/PaperScene.tsx`
is written entirely that way, so the skill cannot ignore it.

Two-stop ranges convert exactly like `useTimelineValue` — the input range is already
absolute milliseconds, so no phase arithmetic is needed.

Multi-stop ranges map to Framer keyframe arrays with a normalized `times`:

```tsx
useTransform(time, [400, 550, 1100], [0, 1, 0])
// → initial={{ opacity: 0 }}
//   animate={{ opacity: [0, 1, 0] }}
//   transition={{ delay: 0.4, duration: 0.7, times: [0, 0.214, 1], ease: [...] }}
```

The arithmetic, stated explicitly because the input range rarely starts at zero —
`PaperScene.tsx` uses `[400, 1100]` and `[400, 550]`:

```
delay    = input[0] / 1000
duration = (input[last] − input[0]) / 1000
times[i] = (input[i] − input[0]) / (input[last] − input[0])
```

Round `times` to 4 decimals. The example's `0.214` is shortened for reading; at these
durations the difference is well under a millisecond, but the skill states the rule so
an agent doesn't infer a precision convention from one example.

Normalizing against `input[last]` alone drops the delay and starts the animation at the
wrong moment. `initial` is required: without it Framer writes no inline value on the
first render, so the element paints at its natural style and jumps to keyframe 0 once
the animation starts. The hook holds at `from` from frame 0, so omitting `initial`
diverges visibly — and more so under SSR.

A `useTransform` whose input isn't the timeline's `time`, or whose output isn't
numeric, is out of scope — refuse it.

### GSAP

The adapter never rewrote the user's GSAP — `useLoupeGsap({ build })` builds their
timeline paused and drives its playhead. Reversing removes the wrapper and lets GSAP
run its own clock:

```tsx
useEffect(() => {
  const ctx = gsap.context(() => { /* the same timeline body */ }, ref);
  return () => ctx.revert();
}, [/* the adapter's deps */]);
```

Carry over rather than assume:

- A real `import { gsap } from 'gsap'` — the adapter supplied it by dynamic import, so
  the build body's parameter name may be anything.
- The adapter's `deps`, not a hardcoded `[]`.
- `scope` was passed as `ref.current`; `gsap.context` takes the ref itself.
- If the consumer reads the returned `{ timeline }`, that binding has to survive.

### WAAPI

Same shape. Call `element.animate(...)` directly with the same keyframes and options —
**and cancel on teardown**:

```tsx
useEffect(() => {
  const anim = el.current?.animate(keyframes, options);
  return () => anim?.cancel();
}, [/* deps */]);
```

The adapter cancels for a reason. Without it, StrictMode's double-invoke leaves two
composited animations on the element and every remount adds another.

### Curves

| Constant | Control points |
|---|---|
| `HOUSE_CURVE_FN` | `[0.59, 0.01, 0.4, 0.98]` |
| `SETTLE_CURVE_FN` | `[0.175, 0.885, 0.32, 1.275]` |

An inline `cubicBezier(a, b, c, d)` is read directly. Framer accepts the array form,
and it is also a valid CSS `cubic-bezier()`.

### Playback

For Framer scenes, Loupe's own loop is a review artifact — production output plays once
on mount. The agent states this in its report; if the animation genuinely loops, the
user says so.

**For GSAP and WAAPI it is not an artifact.** Both adapters expose a `loop` option that
**defaults to true**, and each wraps at the *animation's own* duration rather than the
scene's — a 1.2s GSAP timeline inside a 3s scene runs two and a half times per pass. So:

- `loop: false` in source is an explicit clamp. Honor it silently.
- Default or `loop: true` is a real repeat. Surface it and ask.

GSAP's infinite repeat is `repeat: -1`. `repeat: Infinity` is Framer's spelling and is
not valid GSAP — the skill states both so the agent doesn't guess.

### The scene wrapper

"Dependency-free" means the `@arinze-clinton/loupe` import is gone, which the
conversion rules above don't achieve on their own. Also strip:

- `<TimelineProvider>` — pure scaffolding, remove it and its config object.
- `<SceneRoot>` — **not** an inert wrapper. It merges `pointerEvents` after the
  consumer's style, emits `data-loupe-scene-root`, and takes an `as` prop for the
  element type. Replace it with that same element, carrying the consumer's own style
  and props across. Swapping it for a bare `<div>` silently changes both the tag and
  pointer-events.

`usePhaseEnterKey` and `usePhaseFromTime` are **not** on this list — do not strip
them. They carry behavior that has to be reconstructed, not deleted. See the refusal
table.

## What the skill must refuse to guess

This table is the point of the skill. An agent that quietly invents a number is worse
than no skill.

| Case | Behavior |
|---|---|
| Conditional `from`/`to` — e.g. `reduce ? 1 : 0` | Keep the conditional in the output. Don't collapse it to one branch. |
| Non-literal `phase` — a variable, prop, or computed key | Resolve per rendered instance, not per call site. One call site rendered N times with an index-derived phase has N different delays. Never apply one instance's timing to all of them. |
| Hand-written easing function (not `cubicBezier`) | Stop. Report it. Offer to keep the import or sample it into stops, user's choice. |
| `from`/`to` from props, state, or computed expressions | Stop and report. Don't inline a value observed at one moment. |
| Inverted window (`start > end`) | Stop and report. Never emit a negative duration. |
| `useTransform` not reading the timeline's `time`, or non-numeric output | Out of scope. Refuse. |
| `usePhaseEnterKey` / `usePhaseFromTime` | Stop. It exists to re-fire one-shot effects per loop pass; a `useEffect(…, [])` reversal loses the re-trigger, and the phase it keys on encodes a delay that has to be computed. |
| Lottie via `useLoupeLottie` | The hook *is* the player — it hardcodes `autoplay: false, loop: true` inside `loadAnimation`. Rewrite the call; don't delete a wrapper that isn't there. |
| Scene whose config isn't a literal object | Stop — the timing can't be resolved statically. |
| Destination file unclear or ambiguous | Ask. Never pick a path. |

In every case: convert what's convertible, leave the rest untouched, and say plainly
what was left and why.

## Where the skill lives, and how it reaches people

A second skill directory, not a section in the existing `SKILL.md`:

- Source: `skill/prepare-for-production/SKILL.md`
- Installed to: `.claude/skills/loupe-prepare-for-production/SKILL.md`

The reason is trigger phrases — "prepare for production" reaches a dedicated skill
directly, instead of depending on the agent reading far into a long file.

**Delivery needs a CLI addition, which is a scope change from the original plan.**
`loupe init` returns early for anyone who already has Loupe in `package.json`, behind
a confirm that defaults to no. Existing users — the entire current install base — get
nothing from `init`, new directory or not. `npx loupe skills` writes or refreshes skill
files regardless of install state.

Install state is only half the problem. `init` copies through `writeIfMissing`, which
prompts `"SKILL.md exists — overwrite?"` defaulting to **no**. Reusing it unchanged
would deliver the new skill (nothing sits at that path yet) while silently failing to
deliver the corrected forward table into the `SKILL.md` that's already on disk — the
same failure one level down.

So `loupe skills` needs its own overwrite policy, and the tension is real: skill files
are Loupe-authored, but a user may have edited theirs. The policy:

- Compare on disk against the shipped version. Identical or missing → write, no prompt.
- Differs → show which files differ, prompt defaulting to **yes**, since these are
  Loupe-authored files and the shipped version is the corrected one.
- Back up to `<file>.loupe-backup` before overwriting, matching the convention
  `bridge.ts` already uses. Note `uninstall` does *not* restore from `.loupe-backup`
  generally — it works from two hardcoded discovery sets, neither of which covers
  skills — so the backups have to be removed explicitly (see below).
- `--force` skips the prompt; `--dry-run` prints what would change.

Two supporting changes:

- `package.json` already ships the whole `skill` directory via `files`, so a new
  subdirectory needs no packaging change.
- `loupe uninstall` hardcodes `.claude/skills/loupe/SKILL.md` in both
  `LOUPE_AUTHORED_FILES` and `emptyDirs`. Both lists should be derived from the same
  manifest the sync uses, so they can't drift — and they must include the
  `.loupe-backup` siblings. `pruneEmptyDir` only removes a directory when it's empty,
  so a leftover backup keeps the whole skill directory alive and uninstall stops being
  a clean exit ramp.

## Verification

The report ends with a concrete check: *"scrub `hero-entrance` to 320ms in Loupe and
compare."* Both versions run the same motion at the same moment, so they should look
identical. That gives the user — and the agent — a way to confirm the conversion
rather than trust it.

## Testing

The conversion is instructions, not code, so the tests cover the arithmetic and the
fixtures rather than a generator.

- Unit tests for window resolution: phase + offset + duration, phase with no duration
  (offset not added to the end), `startMs`/`endMs`, `endMs` beating `duration`, no
  phase at all, zero-length window, inverted window. These pin the numbers the skill
  tells the agent to compute.
- Fixture pairs under `test/fixtures/prepare-for-production/`: a timeline-bound scene
  and its expected production form, for Framer, GSAP, WAAPI, and raw `useTransform`
  (two-stop and multi-stop). These are what the skill's examples are checked against,
  and what catches drift if `useTimelineValue` ever changes.
- One fixture per refusal row, asserting the documented behavior is what the skill
  actually describes. The non-literal `phase` case should use the shape from
  `examples/landing/src/scenes/HeroScene.tsx` — one component, four instances, four
  different start times.

## Open questions

- Does `_debugSource` still populate on React 19? The skill doesn't depend on it — the
  agent reads source directly — but the annotation flow does, and it's worth
  confirming separately.
