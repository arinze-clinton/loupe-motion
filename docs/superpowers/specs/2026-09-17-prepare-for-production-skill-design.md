# Prepare for production — design

**Date:** 2026-09-17
**Status:** Approved for planning
**Scope:** One new agent skill. No runtime changes, no CLI changes, no new config.

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

- No build step, bundler plugin, or compile pipeline
- No panel editing or write-back
- No CSS, Lottie, or video output
- No new `SceneConfig` fields
- No changes to how Loupe runs today

These were all considered and cut. Each solves a different problem than the one above.

## How it works

The skill is a markdown file the agent follows. There is no generator to maintain.

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
2. **Resolve the timing.** `phaseOrder` + `phaseDurations` give each phase an absolute
   start. Every value's window falls out of that (see *Conversion rules*).
3. **Ask where it goes.** Destination file, and whether it replaces an existing
   animation or lands fresh. Never guess a destination.
4. **Convert.** Apply the reverse mapping for the library the scene uses.
5. **Write it.** Into the destination the user named.
6. **Report.** What converted, what didn't and why, what to check.

Step 3 is the part that makes this a skill rather than a CLI command. The agent has
the conversation; the user never thinks about paths or formats.

## Conversion rules

### Timing arithmetic

`useTimelineValue` resolves to a window. Reading [hooks.ts](../../../src/runtime/hooks.ts):

```
phase given:   start = phaseStart + (offset ?? 0)
               end   = duration !== undefined ? start + duration : phaseEnd
no phase:      start = startMs ?? 0
               end   = endMs ?? (duration !== undefined ? start + duration : totalDuration)
```

`phaseStart` is the sum of all prior `phaseDurations`. The hook clamps, so the value
holds at `from` before the window and `to` after it.

Worked example, config `{ phaseOrder: ['enter','settle'], phaseDurations: { enter: 600, settle: 400 } }`:

```tsx
useTimelineValue(0, 1, { phase: 'settle', offset: 100, duration: 200 })
// settle starts at 600 → window is 700ms → 900ms
```

### Framer Motion

Reverse of the table already in `skill/SKILL.md`:

```tsx
// Timeline-bound
const opacity = useTimelineValue(0, 1, { phase: 'enter', offset: 200, duration: 500 });
<motion.div style={{ opacity }} />

// Production
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.2, duration: 0.5 }}
/>
```

Several values on one element get per-property transitions, which Framer supports
directly:

```tsx
transition={{
  opacity: { delay: 0.7, duration: 0.2 },
  y:       { delay: 0.6, duration: 0.3 },
}}
```

Framer holds at `initial` before the delay and at `animate` after, which matches the
hook's clamping. Milliseconds become seconds.

### GSAP

The adapter never rewrote the user's GSAP — `useLoupeGsap({ build })` builds their
timeline paused and drives its playhead. Reversing is removing the wrapper and letting
GSAP run its own clock:

```tsx
// Timeline-bound
useLoupeGsap({ scope: ref.current, deps: [ref.current], build: (gsap) => gsap.timeline()... });

// Production — same build body, GSAP plays it
useEffect(() => {
  const ctx = gsap.context(() => { /* the same timeline */ }, ref);
  return () => ctx.revert();
}, []);
```

Nothing about the animation is recomputed. The build function is already production
code.

### WAAPI

Same shape — `useLoupeWaapi({ build })` pauses the animation and writes `currentTime`.
Reversing means calling `element.animate(...)` directly in an effect with the same
keyframes and options. Keep `fill: 'both'` when the element should hold its end state.

### Curves

`ease` defaults to `HOUSE_CURVE_FN`. The two exported constants map to known control
points, from [phases.ts](../../../src/runtime/phases.ts):

| Constant | Control points |
|---|---|
| `HOUSE_CURVE_FN` | `[0.59, 0.01, 0.4, 0.98]` |
| `SETTLE_CURVE_FN` | `[0.175, 0.885, 0.32, 1.275]` |

An inline `cubicBezier(a, b, c, d)` is read directly. Framer accepts the array form as
`ease`, and it is also a valid CSS `cubic-bezier()`.

### Playback

Loupe loops — the rAF tick wraps at total duration. Production output plays once on
mount, which is what the destination almost always wants. The agent states this in its
report rather than asking up front; if the animation genuinely loops, the user says so
and the agent adds `repeat: Infinity` (or the GSAP/WAAPI equivalent).

## What the skill must refuse to guess

This list is the point of the skill. An agent that quietly invents a number is worse
than no skill.

| Case | Behavior |
|---|---|
| Conditional `from`/`to` — e.g. `reduce ? 1 : 0` | Keep the conditional in the output. Don't collapse it to one branch. |
| Hand-written easing function (not `cubicBezier`) | Stop. Report it. Offer to keep the import or sample it into keyframe stops, user's choice. |
| Values from props, state, or computed expressions | Stop and report. Don't inline a value observed at one moment. |
| Lottie scenes | Already its own format. Remove the Loupe driving, keep the player. |
| Scene whose config isn't a literal object | Stop — the timing can't be resolved statically. |
| Destination file unclear or ambiguous | Ask. Never pick a path. |

In every case: convert what's convertible, leave the rest untouched, and say plainly
what was left and why.

## Where the skill lives

A second skill directory, not a section in the existing `SKILL.md`:

- Source: `skill/prepare-for-production/SKILL.md`
- Installed to: `.claude/skills/loupe-prepare-for-production/SKILL.md`

Two reasons. It gets its own trigger phrases, so "prepare for production" reaches it
directly instead of depending on the agent reading far into a long file. And `loupe
init` installs with `writeIfMissing`, so existing users — who already have a
`SKILL.md` on disk — would never receive an edit to that file, but will receive a new
one.

`package.json` already ships the whole `skill` directory via `files`, so a new
subdirectory needs no packaging change. `init` needs to copy the second skill
alongside the first.

## Verification

The report ends with a concrete check: *"scrub `hero-entrance` to 320ms in Loupe and
compare."* Both versions are running the same motion at the same moment, so they
should look identical. That gives the user — and the agent — a way to confirm the
conversion rather than trust it.

## Testing

The conversion is instructions, not code, so the tests are on the arithmetic and the
fixtures rather than on a generator.

- Unit tests for window resolution: phase + offset + duration, phase with no duration,
  `startMs`/`endMs`, no phase at all. These pin the numbers the skill tells the agent
  to compute.
- Fixture pairs under `test/fixtures/prepare-for-production/`: a timeline-bound scene
  and its expected production form, for Framer, GSAP, and WAAPI. These are what the
  skill's examples are checked against, and what catches drift if `useTimelineValue`
  ever changes.
- One fixture per refusal case, asserting the documented behavior is what the skill
  actually describes.

## Open questions

- Does `_debugSource` still populate on React 19? The skill doesn't depend on it —
  the agent reads source directly — but the annotation flow does, and it's worth
  confirming separately.
