import {
  createContext,
  useCallback,
  useContext,
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
