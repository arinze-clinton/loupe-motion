# Native runtime adapter (`@arinze-clinton/loupe/native`) — design

**Date:** 2026-09-22
**Status:** Spec only — deferred. Needs a real Expo + Reanimated app on a device/
simulator to build and verify safely; not built in the session that wrote this.

## Why this is separate from "React Native handoff"

Step 4 split in two:

- **Handoff (shipped, v0.10.0):** you tune on Loupe's web timeline, and
  prepare-for-production emits a Reanimated component. The shipping component is
  *rebuilt* from the resolved facts. Timing/curve/bounce transfer exactly; the visual
  is the agent's to reconstruct. Low risk, verified by type-checking the emitted code.

- **Native runtime (this spec):** `useTimelineValue` / `useTimelineSpring` return a
  *live Reanimated value* on native, so the workbench (via Expo / react-native-web)
  runs the **real** component that ships — no rebuild. This is the "real running code,
  not a recording" promise extended to mobile. It's also the large one.

## The core problem

Loupe's runtime is framer-motion: `useTimelineValue` returns a `MotionValue<number>`
derived from a `time` MotionValue via `useTransform`. Framer animates the DOM. React
Native has no DOM and no MotionValue — it has Reanimated *shared values* read inside
*worklets* that run on the UI thread. The two models don't compose.

So a native adapter has to reproduce Loupe's timeline model on Reanimated primitives,
sharing nothing with the framer implementation but the concepts.

## Shape

A `/native` subpath (parallel to `/gsap`, `/waapi`), selected by React Native's
platform resolution (`*.native.ts`) or an explicit import.

1. **The clock.** A shared value `time` advanced by a `useFrameCallback` loop (Reanimated's
   frame callback), wrapping at the scene's total duration — the native mirror of
   TimelineProvider's rAF loop. Pause = stop advancing. Seek = set `time.value`.

2. **`useTimelineValue(from, to, opts)`** → `useDerivedValue(() => interpolate(time.value,
   [start, end], [from, to], Extrapolation.CLAMP))`. `interpolate` is Reanimated's, runs
   in a worklet. The window math (`resolveWindow`) is pure and ports directly.

3. **`useTimelineSpring`** is the hard part. Springs can't be `interpolate`d from a clock
   the same way. Options to evaluate on-device:
   - Pre-sample the spring (like `sampleSpring` does for web) into arrays and
     `interpolate` the clock across them in a worklet. Deterministic, scrub-safe, and
     parallels the web approach — most promising.
   - Drive Reanimated's own spring off the clock — fighting its internal clock; likely
     not scrub-safe.
   The sampled-table approach is the one to try first; it's the same insight that made
   web springs work.

4. **The panel.** There is none on native (the panel is DOM/framer). Two honest modes:
   - **Workbench via react-native-web:** the component runs in the browser through
     react-native-web, where the DOM panel *does* work and drives the same clock. This
     is the intended tuning surface and the reason the workbench matters here.
   - **On-device:** no panel. Either a headless clock driven by a web remote (future),
     or simply no scrubbing on device — you scrub in the web workbench, run on device to
     confirm.

## The verification that gates building this

- A real Expo app with `react-native-reanimated` installed.
- The adapter driving a scene on the iOS simulator (this environment has a simulator
  tool) *and* through react-native-web in the browser, showing the same scrub.
- Confirm worklet-safety (no reads of JS-thread values inside the derived worklet) and
  that `useFrameCallback` wrapping matches the web loop.

Without that, the adapter would ship unverified — which is why it's a spec, not code.

## What already de-risks it

- `resolveWindow` (pure) and `sampleSpring` (pure, just needs Reanimated's `interpolate`
  instead of framer's `useTransform`) port with little change.
- The `{duration, bounce}` ↔ `{duration, dampingRatio = 1 − bounce}` mapping is proven
  and type-checked against Reanimated 3.19.
- The handoff target already emits correct Reanimated, so the "what good output looks
  like" is settled.

## Open questions for the build

- Does the sampled-spring-table approach interpolate cleanly in a worklet at 60/120fps?
- react-native-web + Reanimated in a Vite workbench: does Reanimated's web build drive
  `useFrameCallback` there, or is a web shim needed for the clock?
- Multi-scene registry on native — the web registry is React context; that ports, but
  the panel-driven `activeSceneId` has no native panel to set it.
