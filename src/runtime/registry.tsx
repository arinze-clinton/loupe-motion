import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MotionValue } from 'framer-motion';
import type { PhaseRange } from './phases';

/**
 * LoupeRegistry — app-root context that knows about every Loupe-enabled
 * scene currently mounted on the page. A single floating panel drives the
 * active scene picked from the dropdown.
 */

export type RegisteredTimeline = {
  time: MotionValue<number>;
  ranges: PhaseRange[];
  totalDuration: number;
  phaseOrder: readonly string[];
  phaseLabels?: Readonly<Record<string, string>>;
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  seek: (ms: number) => void;
  restart: () => void;
};

export type RegisteredAnnotations = {
  state: unknown;
};

export type RegisteredScene = {
  id: string;
  label: string;
  rootRef: React.RefObject<HTMLElement | null>;
  timeline: RegisteredTimeline;
  annotations?: RegisteredAnnotations;
};

/**
 * Shape callers pass to `useRegisterSceneWithLoupe`. Matches what
 * a TimelineProvider-style component already computes — a MotionValue
 * + scene config + controls. Keep this decoupled from our internal
 * `TimelineState` so third-party timelines don't need to mirror our
 * exact types.
 */
export type ExternalScene = {
  id: string;
  label: string;
  phaseOrder: readonly string[];
  phaseLabels?: Readonly<Record<string, string>>;
  ranges: PhaseRange[];
  totalDuration: number;
  time: MotionValue<number>;
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  seek: (ms: number) => void;
  restart: () => void;
};

type LoupeRegistryState = {
  scenes: RegisteredScene[];
  activeSceneId: string | null;
  setActiveSceneId: (id: string) => void;
  registerScene: (scene: RegisteredScene) => void;
  unregisterScene: (id: string) => void;
  attachAnnotations: (sceneId: string, ann: RegisteredAnnotations) => void;
  flashTick: number;
  flash: (id: string) => void;
};

const LoupeRegistryContext = createContext<LoupeRegistryState | null>(null);

export function LoupeRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const scenesRef = useRef<RegisteredScene[]>([]);
  const [scenes, setScenes] = useState<RegisteredScene[]>([]);
  const [activeSceneId, setActiveSceneIdState] = useState<string | null>(null);
  const [flashTick, setFlashTick] = useState(0);

  const sync = useCallback(() => {
    setScenes([...scenesRef.current]);
  }, []);

  const registerScene = useCallback(
    (scene: RegisteredScene) => {
      const existing = scenesRef.current.find((s) => s.id === scene.id);
      if (existing) {
        Object.assign(existing, scene);
      } else {
        scenesRef.current.push(scene);
      }
      sync();
      setActiveSceneIdState((current) => current ?? scene.id);
    },
    [sync],
  );

  const unregisterScene = useCallback(
    (id: string) => {
      scenesRef.current = scenesRef.current.filter((s) => s.id !== id);
      sync();
      setActiveSceneIdState((current) => {
        if (current !== id) return current;
        const next = scenesRef.current[0]?.id ?? null;
        return next;
      });
    },
    [sync],
  );

  const attachAnnotations = useCallback(
    (sceneId: string, ann: RegisteredAnnotations) => {
      const scene = scenesRef.current.find((s) => s.id === sceneId);
      if (!scene) return;
      scene.annotations = ann;
      sync();
    },
    [sync],
  );

  const setActiveSceneId = useCallback((id: string) => {
    setActiveSceneIdState(id);
    setFlashTick((t) => t + 1);
  }, []);

  const flash = useCallback((id: string) => {
    setActiveSceneIdState(id);
    setFlashTick((t) => t + 1);
  }, []);

  const value = useMemo<LoupeRegistryState>(
    () => ({
      scenes,
      activeSceneId,
      setActiveSceneId,
      registerScene,
      unregisterScene,
      attachAnnotations,
      flashTick,
      flash,
    }),
    [
      scenes,
      activeSceneId,
      setActiveSceneId,
      registerScene,
      unregisterScene,
      attachAnnotations,
      flashTick,
      flash,
    ],
  );

  return (
    <LoupeRegistryContext.Provider value={value}>
      {children}
    </LoupeRegistryContext.Provider>
  );
}

export function useLoupeRegistry(): LoupeRegistryState {
  const ctx = useContext(LoupeRegistryContext);
  if (!ctx)
    throw new Error('useLoupeRegistry must be used inside LoupeRegistryProvider');
  return ctx;
}

export function useOptionalLoupeRegistry(): LoupeRegistryState | null {
  return useContext(LoupeRegistryContext);
}

/**
 * Register a scene with the Loupe panel's registry from outside
 * Loupe's built-in `<TimelineProvider>`. Useful when you've got
 * your OWN TimelineProvider implementation (e.g. a local copy of
 * the timeline primitives) and just want its state to show up in
 * the Loupe panel's scene dropdown.
 *
 * Call this inside your provider with the scene's timeline state
 * + the root-element ref you want the panel to flash / scroll to.
 * No-op if no `<LoupeRegistryProvider>` is mounted above — safe to
 * leave in place even when Loupe isn't active.
 *
 * @example
 * ```tsx
 * function MyTimelineProvider({ config, children }) {
 *   const time = motionValue(0);
 *   // ...all the usual state...
 *   const value = { id: config.id, label: config.label, time, ... };
 *   const rootRef = useRef<HTMLDivElement | null>(null);
 *   useRegisterSceneWithLoupe(value, rootRef);
 *   return <div ref={rootRef}>{children}</div>;
 * }
 * ```
 */
export function useRegisterSceneWithLoupe(
  scene: ExternalScene,
  rootRef: React.RefObject<HTMLElement | null>,
): void {
  const registry = useOptionalLoupeRegistry();
  // Pull the stable useCallback refs off the registry BEFORE using
  // them as deps. Depending on the whole `registry` object would
  // retrigger the effect on every scene registration (registry.value
  // re-memoizes when scenes changes), which re-registers, which
  // re-memoizes, which re-registers — infinite loop. The callback
  // references are stable, so deps on them are safe.
  const registerScene = registry?.registerScene;
  const unregisterScene = registry?.unregisterScene;

  useEffect(() => {
    if (!registerScene || !unregisterScene) return;
    registerScene({
      id: scene.id,
      label: scene.label,
      rootRef,
      timeline: {
        time: scene.time,
        ranges: scene.ranges,
        totalDuration: scene.totalDuration,
        phaseOrder: scene.phaseOrder,
        phaseLabels: scene.phaseLabels,
        speed: scene.speed,
        setSpeed: scene.setSpeed,
        paused: scene.paused,
        setPaused: scene.setPaused,
        seek: scene.seek,
        restart: scene.restart,
      },
    });
    return () => unregisterScene(scene.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scene.id,
    scene.label,
    scene.phaseOrder,
    scene.phaseLabels,
    scene.ranges,
    scene.totalDuration,
    scene.paused,
    scene.speed,
    rootRef,
    registerScene,
    unregisterScene,
  ]);
}

const SceneRootRefContext = createContext<React.RefObject<HTMLElement | null> | null>(
  null,
);

export function SceneRootRefProvider({
  refValue,
  children,
}: {
  refValue: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  return (
    <SceneRootRefContext.Provider value={refValue}>
      {children}
    </SceneRootRefContext.Provider>
  );
}

export function useSceneRootRef(): React.RefObject<HTMLElement | null> {
  const ref = useContext(SceneRootRefContext);
  if (!ref)
    throw new Error('useSceneRootRef must be used inside a TimelineProvider');
  return ref;
}
