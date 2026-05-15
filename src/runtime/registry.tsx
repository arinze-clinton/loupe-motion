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
  /**
   * Set the active scene by id, or pass `null` to clear selection
   * (collapses the floating panel to a draggable pill). Marks the
   * user's choice as sticky so later registrations don't auto-swap
   * it back.
   */
  setActiveSceneId: (id: string | null) => void;
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
  /**
   * Once the user explicitly picks a scene via the panel dropdown,
   * stop auto-switching on new registrations. Without this we'd
   * yank the user's selection back to "whatever just registered"
   * every time a scene re-registered (common with HMR / effect
   * re-runs).
   */
  const userPickedRef = useRef(false);

  const sync = useCallback(() => {
    setScenes([...scenesRef.current]);
  }, []);

  /** ID of the generated demo scene — the registry treats it as
   *  secondary to any real scene. See `cli/auto-wire.ts`. */
  const DEMO_SCENE_ID = 'loupe-demo';

  const registerScene = useCallback(
    (scene: RegisteredScene) => {
      const existing = scenesRef.current.find((s) => s.id === scene.id);
      if (existing) {
        Object.assign(existing, scene);
      } else {
        scenesRef.current.push(scene);
      }
      sync();
      setActiveSceneIdState((current) => {
        // User has already made an explicit pick — honor it.
        if (userPickedRef.current) return current;
        // Prefer any real scene over the demo. If the current active
        // is the demo and a non-demo just registered, auto-switch.
        const nonDemo = scenesRef.current.find(
          (s) => s.id !== DEMO_SCENE_ID,
        );
        if (nonDemo) return nonDemo.id;
        // Only demo around — keep current selection or fall back.
        return current ?? scene.id;
      });
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

  const setActiveSceneId = useCallback((id: string | null) => {
    userPickedRef.current = true;
    setActiveSceneIdState(id);
    // Only flash when selecting a real scene — collapsing to "None"
    // doesn't need a flash since there's nothing to highlight on the
    // page.
    if (id) setFlashTick((t) => t + 1);
  }, []);

  const flash = useCallback((id: string) => {
    setActiveSceneIdState(id);
    setFlashTick((t) => t + 1);
  }, []);

  /**
   * Picker rescue: force `pointer-events: auto` on every registered
   * scene's root element while Loupe is mounted. `document.elementFromPoint`
   * sees through any ancestor with `pointer-events: none`, so a scene
   * wrapped in (or nested under) a click-through container would be
   * invisible to the picker. Patching here means every scene that goes
   * through `TimelineProvider` or `useRegisterSceneWithLoupe` is rescued
   * automatically — consumers don't have to remember the rule.
   *
   * We record the element's original inline `pointerEvents` value so we
   * can restore it when the scene unregisters or the provider unmounts.
   */
  const patchedRef = useRef<Map<string, { el: HTMLElement; original: string }>>(
    new Map(),
  );
  useEffect(() => {
    const patched = patchedRef.current;
    const liveIds = new Set(scenes.map((s) => s.id));

    // Restore + drop entries for scenes that have gone away.
    for (const [id, entry] of patched) {
      if (!liveIds.has(id)) {
        entry.el.style.pointerEvents = entry.original;
        patched.delete(id);
      }
    }

    // Patch any scene whose element is mounted and not yet patched.
    for (const scene of scenes) {
      const el = scene.rootRef.current;
      if (!(el instanceof HTMLElement)) continue;
      const existing = patched.get(scene.id);
      if (existing && existing.el === el) continue;
      // Element swapped (HMR, remount) — restore the old one before
      // re-patching the new one.
      if (existing && existing.el !== el) {
        existing.el.style.pointerEvents = existing.original;
      }
      patched.set(scene.id, { el, original: el.style.pointerEvents });
      el.style.pointerEvents = 'auto';
    }
  }, [scenes]);

  useEffect(() => {
    // Provider-unmount cleanup: restore every patched element.
    const patched = patchedRef.current;
    return () => {
      for (const entry of patched.values()) {
        entry.el.style.pointerEvents = entry.original;
      }
      patched.clear();
    };
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

/**
 * Like `useSceneRootRef` but returns `null` when no provider is mounted.
 * Used by `<SceneRoot>` to detect whether Loupe is active without throwing
 * in production code that ships the component but skips the provider.
 */
export function useOptionalSceneRootRef(): React.RefObject<HTMLElement | null> | null {
  return useContext(SceneRootRefContext);
}
