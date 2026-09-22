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
- **Fix the publish pipeline** ✅ CI now skips-with-warning on a missing/expired
  token (no more failure emails) and defers to a local publish (no race). Token
  refresh itself is still the user's to do to re-enable automated publishing.
- **Panel:** theme tokens extracted to `panel/theme.ts` ✅. The deeper
  structural split (icons, overlays, controls) is **folded into Step 3** —
  springs touch the panel anyway, so we split once, there, instead of twice.
  Note the "after-unmount frame loop" turned out to be correct cleanup that
  just doesn't terminate in a layout-less test env, not a production leak.

### Step 2 — Workbench mode ✅ *shipped*
`loupe workbench` scaffolds a standalone Vite page (starter scene + panel), with
a `.loupe/workbench.json` marker so scan/check/skills know it's a workbench.
`loupe check` now reports workbench presence and whether installed skills have
drifted behind the package (closing the gap where `init`'s early-return left
existing users on old skills). `init` points at it. Framework-agnostic; verified
end-to-end in a browser. Deeper: this is where prepare-for-production stops being
a nicety and becomes the only way out.

### Step 3 — Springs on the timeline ✅ *shipped*
`useTimelineSpring(from, to, { phase, duration, bounce })`. A spring is a
function of time, so it scrubs like everything else. Uses Apple's iOS-17
`{duration, bounce}` vocabulary via framer's own spring, sampled into a
scrub-safe table. Finding: a `{duration,bounce}` spring settles *within* its
duration (verified to bounce 0.7), so it occupies the same `[start,end]` window
as an eased value — the feared loop-overflow / auto-rest-phase problem doesn't
arise, so no loop surgery was needed. resolve reports `kind:'spring'` + bounce;
both skills teach spring-vs-curve (from feedback) and spring conversion
(`type:'spring'` in Framer, `withSpring` note for RN). Verified in-browser:
overshoot to 1.025 past a 1.0 target, clock-driven. Prerequisite for mobile.

### Step 4 — React Native / Expo (split)
- **Handoff** ✅ *shipped* — prepare-for-production emits Reanimated:
  eased → `withTiming(to, { duration, easing: Easing.bezier(...) })`, spring →
  `withSpring(to, { duration, dampingRatio: 1 − bounce })`, delays via
  `withDelay`, web style → RN `transform` array. Durations in ms (not seconds).
  The emitted code was type-checked against real Reanimated 3.19 types. Timing,
  curve, and bounce transfer exactly; the component is rebuilt from resolve's
  facts, not the same instance.
- **Native runtime adapter** — spec'd, deferred:
  `docs/superpowers/specs/2026-09-22-native-runtime-adapter-design.md`.
  `useTimelineValue`/`useTimelineSpring` returning live Reanimated values so the
  workbench runs the *real* shipping component. Needs a real Expo + Reanimated
  app on a device to build and verify safely — not shipped unverified. The pure
  pieces (resolveWindow, sampleSpring) port with little change; the sampled-
  spring-table approach is the promising path for native springs.

## Parked (revisit later, deliberately not now)
- **Native Reanimated runtime adapter** — spec'd above; the next real build,
  gated on a device to verify against.
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
