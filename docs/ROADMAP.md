# Loupe roadmap

Where Loupe is going and why. Living doc — updated as steps land.

## What Loupe is

The place you tune motion. You give feedback in plain language, an agent makes
the edits, and Loupe hands the finished animation off to wherever it ships.
Loupe is not a click-the-easing-curve editor — the agent is the editor.

## The self-setup principle (the ladder)

Every gotcha Loupe knows about is handled as high up this ladder as possible,
so the user thinks about it as little as possible:

1. **Runtime** handles it silently → user never knows
2. **CLI** detects and fixes it → user sees a ✓
3. **Skill** tells the agent how → agent does it, user hears one sentence
4. **User** acts → only when there's genuinely no other way

`loupe check` is the doctor: it inspects a project, lists what's off, and the
skill tells the agent to run it and fix what it reports. Adjustments happen
when they're needed, without the user remembering they exist.

## The steps

Each ships on its own. Nothing waits on the whole.

### Step 1 — Foundations (in progress)
Make the ground dependable before building on it.
- **`loupe resolve --json`** ✅ *shipped* — Loupe does the animation math and
  emits the facts; the agent copies answers instead of computing them. The
  static-analysis boundary IS the refusal boundary: literal → convertible with
  resolved absolute-ms timing; computed/conditional → a machine-readable
  refusal code, never a guess. 19 fixture tests pin the arithmetic + refusals.
- **Fixtures** ✅ *shipped* — resolve output pinned against the real landing
  scenes (25 tests total). Chose fixture tests over a separate `release-check`
  command; `npm test` in CI already runs them.
- **prepare-for-production reads from resolve** ✅ *shipped* — validated by a
  fresh agent that took resolve's numbers verbatim and refused what resolve
  refused, including a correct *partial conversion* when a scene has refused
  values.
- **Fix the publish pipeline** — token (user, still outstanding) + single
  publisher (no laptop/CI race).
- **Panel:** theme tokens extracted to `panel/theme.ts` ✅. The deeper
  structural split (icons, overlays, controls) is **folded into Step 3** —
  springs touch the panel anyway, so we split once, there, instead of twice.
  Note the "after-unmount frame loop" turned out to be correct cleanup that
  just doesn't terminate in a layout-less test env, not a production leak.

### Step 2 — Workbench mode
A blank page to build an animation in when the real page won't cooperate.
`loupe init` offers in-place vs workbench; a marker file records which. This is
where prepare-for-production stops being a nicety and becomes the only way out.

### Step 3 — Springs on the timeline
`useTimelineSpring(from, to, { phase, duration, bounce })`. A spring is a
function of time, so it scrubs like everything else. Loupe computes where it
settles and auto-extends the loop so a bounce is never cut off — the user never
adds a rest phase. Prerequisite for mobile, not an add-on.

### Step 4 — React Native / Expo
`useTimelineValue` returns a Reanimated value on native, a MotionValue on web
(a `/native` adapter — the biggest engineering item, requires prying the
timeline core off Framer). Expo runs in the browser, so the workbench runs the
*real* component that ships to iOS/Android.

## Parked (revisit later, deliberately not now)
- **Native SwiftUI / Compose** as a handoff *spec* (exact phases/ms/curves +
  reference render), not a conversion — the browser draws with a different
  engine than the phone, so a preview can't be the product, and visuals would
  be rebuilt natively, not converted.
- **A native Loupe panel** in the simulator driving a native timeline. Real
  final frontier; different product.

## Problems anticipated, with their fixes
| Problem | Fix | Lands at |
|---|---|---|
| Spring cut off by the loop | compute settle, auto-extend loop | runtime (silent) |
| Two Loupes in one repo | marker file | CLI (silent) |
| Panel too big / frame leak | split file, stop the loop | internal |
| Publish pipeline dead | new token + single publisher | user + CLI |
| Workbench can't import project components | best-effort wire, else copy in | CLI + skill |
| React 19 dropped `_debugSource` | verify; dev plugin to stamp source | CLI, if needed |

## How we work
Spec → adversarial review against source → build → verify in a real browser →
mutation-test the tests → ship. Scaled to size: a settle warning needs no spec;
the `/native` adapter needs a full one. Two hard rules: nothing touches a skill
without being run against a fixture; the user decides at decision points, not
every step.
