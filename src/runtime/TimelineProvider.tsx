import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motionValue, type MotionValue } from 'framer-motion';
import {
  computeRanges,
  totalDurationFor,
  wrapTime,
  type PhaseRange,
  type SceneConfig,
} from './phases';
import { SceneRootRefProvider, useOptionalLoupeRegistry } from './registry';

/**
 * TimelineProvider — owns the time axis for a single scene.
 *
 * Each scene wraps itself in a `<TimelineProvider config={...}>`. The provider
 * computes phase ranges, runs the rAF loop, and (if a LoupeRegistry is mounted
 * above) registers itself so the floating panel can drive it.
 */

export type TimelineState = {
  sceneId: string;
  sceneLabel: string;
  ranges: PhaseRange[];
  totalDuration: number;
  phaseOrder: readonly string[];
  time: MotionValue<number>;
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  seek: (ms: number) => void;
  restart: () => void;
};

export const TimelineContext = createContext<TimelineState | null>(null);

export function TimelineProvider({
  config,
  children,
}: {
  config: SceneConfig;
  children: React.ReactNode;
}) {
  const time = useMemo(() => motionValue(0), []);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const sceneRootRef = useRef<HTMLElement | null>(null);

  const ranges = useMemo(() => computeRanges(config), [config]);
  const totalDuration = useMemo(() => totalDurationFor(ranges), [ranges]);

  useEffect(() => {
    if (paused) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimestampRef.current = null;
      return;
    }
    const tick = (t: number) => {
      if (lastTimestampRef.current === null) lastTimestampRef.current = t;
      const dt = (t - lastTimestampRef.current) * speed;
      lastTimestampRef.current = t;
      time.set(wrapTime(time.get() + dt, totalDuration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimestampRef.current = null;
    };
  }, [paused, speed, time, totalDuration]);

  const seek = (ms: number) => {
    const clamped = Math.max(0, Math.min(ms, Math.max(0, totalDuration - 1)));
    time.set(clamped);
    lastTimestampRef.current = null;
  };

  const restart = () => {
    time.set(0);
    lastTimestampRef.current = null;
  };

  const value = useMemo<TimelineState>(
    () => ({
      sceneId: config.id,
      sceneLabel: config.label,
      ranges,
      totalDuration,
      phaseOrder: config.phaseOrder,
      time,
      speed,
      setSpeed,
      paused,
      setPaused,
      seek,
      restart,
    }),
    [
      config.id,
      config.label,
      config.phaseOrder,
      ranges,
      totalDuration,
      time,
      speed,
      paused,
    ],
  );

  const registry = useOptionalLoupeRegistry();
  // Identity-level registration. Mount = register, unmount =
  // unregister. We deliberately KEEP paused/speed out of the deps
  // here: React would otherwise run the cleanup (unregisterScene)
  // on every pause toggle, and `unregisterScene` reassigns the
  // active scene to whatever's left in the array — which snaps the
  // panel to the first-registered scene mid-flip. A separate
  // effect below pushes paused/speed updates without tearing the
  // registration down.
  useEffect(() => {
    if (!registry) return;
    registry.registerScene({
      id: config.id,
      label: config.label,
      rootRef: sceneRootRef,
      timeline: {
        time,
        ranges,
        totalDuration,
        phaseOrder: config.phaseOrder,
        phaseLabels: config.phaseLabels,
        speed,
        setSpeed,
        paused,
        setPaused,
        seek,
        restart,
      },
    });
    return () => registry.unregisterScene(config.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.id,
    config.label,
    config.phaseOrder,
    config.phaseLabels,
    ranges,
    totalDuration,
  ]);

  // Live updates for paused/speed. registerScene merges into the
  // existing entry by id (Object.assign), so this just refreshes
  // the live values without a register/unregister cycle.
  useEffect(() => {
    if (!registry) return;
    registry.registerScene({
      id: config.id,
      label: config.label,
      rootRef: sceneRootRef,
      timeline: {
        time,
        ranges,
        totalDuration,
        phaseOrder: config.phaseOrder,
        phaseLabels: config.phaseLabels,
        speed,
        setSpeed,
        paused,
        setPaused,
        seek,
        restart,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, speed]);

  return (
    <TimelineContext.Provider value={value}>
      <SceneRootRefProvider refValue={sceneRootRef}>
        {/*
          We deliberately do NOT attach the scene ref to a wrapper here.
          Earlier versions wrapped children in a `display: contents` div
          and pinned the ref to it as a "safe default" so the registry's
          flash overlay always had something to measure. Two problems
          surfaced from that:
            1. React's commit order made the wrapper's ref-attach run AFTER
               any consumer that attached the same ref to their own root,
               so the ref ended up on the `display: contents` element.
            2. IntersectionObserver (the engine behind framer-motion's
               `useInView`) treats `display: contents` elements as having
               no layout box on most engines, so consumers' in-view
               auto-pause logic silently never fired `true` and scenes
               appeared frozen.
          Consumers are expected to call `useSceneRootRef()` and attach
          the returned ref to their own root element. If a consumer
          forgets, ref-dependent registry features (flash, scroll-to-
          scene) degrade gracefully — but timeline playback, panel
          control, and `useInView`-driven auto-pause all keep working.
        */}
        {children}
      </SceneRootRefProvider>
    </TimelineContext.Provider>
  );
}

export function useTimeline(): TimelineState {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error('useTimeline must be used inside <TimelineProvider>');
  return ctx;
}
