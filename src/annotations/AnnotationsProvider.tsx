import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLoupeRegistry } from '../runtime/registry';
import { phaseAtTime, rangeOf } from '../runtime/phases';
import { elementToSelector } from './selector';
import { fiberInfo } from './fiber';
import { loadAnnotations, saveAnnotations } from './storage';
import type { Annotation, AnnotationDraft } from './types';

/**
 * AnnotationsProvider — lives at app root (above all TimelineProviders).
 *
 * Reads `activeSceneId` from the LoupeRegistry and presents that scene's
 * annotation list. Scene-aware ops (pickElement, pickRegion, focusAnnotation)
 * read time/pause/seek from the active scene's registered TimelineState.
 */

export type PickerMode = 'off' | 'element' | 'region';

type AnnotationsState = {
  annotations: Annotation[];
  visible: boolean;
  pickerMode: PickerMode;
  draft: AnnotationDraft | null;

  setVisible: (v: boolean) => void;
  setPickerMode: (m: PickerMode) => void;
  /**
   * Accepts any DOM `Element`, NOT `HTMLElement`. SVG nodes (paper paths,
   * circles, cross strokes inside an animated `<svg>`) inherit from
   * `Element` only — tightening this to `HTMLElement` silently drops every
   * SVG pick and was the original bug behind "I can't select the paper."
   * Regression covered in `AnnotationsProvider.test.tsx`.
   */
  pickElement: (el: Element) => void;
  pickRegion: (region: { x: number; y: number; w: number; h: number }) => void;
  commitDraft: (note: string) => void;
  cancelDraft: () => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  clearAll: () => void;
  focusAnnotation: (id: string) => Annotation | undefined;

  /**
   * Snapshot of the last destructive action, restorable for UNDO_WINDOW_MS.
   *
   * Destructive annotation actions are NOT gated behind `window.confirm()`.
   * A suppressed confirm (Chrome's "prevent additional dialogs" checkbox, or
   * a sandboxed iframe without `allow-modals`) returns `false` instantly and
   * without UI, which made the control silently do nothing. Delete now
   * happens immediately and is undoable instead.
   */
  undo: UndoEntry | null;
  undoLastAction: () => void;
  dismissUndo: () => void;
};

/** How long an undone-able action stays restorable. */
export const UNDO_WINDOW_MS = 6000;

export type UndoEntry = {
  /** Scene this snapshot belongs to. Restore targets THIS, not the active scene. */
  sceneId: string;
  label: string;
  annotations: Annotation[];
};

const AnnotationsContext = createContext<AnnotationsState | null>(null);

const COLOR_ELEMENT = 'var(--loupe-accent, #3A97F9)';
const COLOR_REGION = 'var(--loupe-region-accent, #A855F7)';

export function AnnotationsProvider({ children }: { children: React.ReactNode }) {
  const registry = useLoupeRegistry();
  const activeSceneId = registry.activeSceneId;
  const activeScene = activeSceneId
    ? registry.scenes.find((s) => s.id === activeSceneId)
    : undefined;

  const [annotationsBySceneId, setAnnotationsBySceneId] = useState<
    Record<string, Annotation[]>
  >({});
  const [visible, setVisible] = useState(true);
  const [pickerMode, setPickerModeState] = useState<PickerMode>('off');
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);

  const loadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeSceneId) return;
    if (loadedRef.current.has(activeSceneId)) return;
    loadedRef.current.add(activeSceneId);
    const loaded = loadAnnotations(activeSceneId);
    setAnnotationsBySceneId((prev) => ({ ...prev, [activeSceneId]: loaded }));
  }, [activeSceneId]);

  const annotations = activeSceneId
    ? annotationsBySceneId[activeSceneId] ?? []
    : [];

  useEffect(() => {
    if (!activeSceneId) return;
    if (!loadedRef.current.has(activeSceneId)) return;
    saveAnnotations(activeSceneId, annotations);
  }, [activeSceneId, annotations]);

  const setSceneAnnotations = useCallback(
    (sceneId: string, updater: (prev: Annotation[]) => Annotation[]) => {
      setAnnotationsBySceneId((prev) => ({
        ...prev,
        [sceneId]: updater(prev[sceneId] ?? []),
      }));
    },
    [],
  );

  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  const pushUndo = useCallback(
    (entry: UndoEntry) => {
      clearUndoTimer();
      setUndo(entry);
      undoTimerRef.current = window.setTimeout(() => {
        undoTimerRef.current = null;
        setUndo(null);
      }, UNDO_WINDOW_MS);
    },
    [clearUndoTimer],
  );

  const setPickerMode = useCallback(
    (m: PickerMode) => {
      if (m !== 'off' && activeScene) activeScene.timeline.setPaused(true);
      setPickerModeState(m);
      if (m === 'off') setDraft(null);
    },
    [activeScene],
  );

  const snapshotForActive = useCallback(() => {
    if (!activeScene) {
      return {
        sceneId: 'unknown',
        sceneLabel: 'Unknown',
        phase: '',
        phaseElapsedMs: 0,
        phaseDurationMs: 0,
        globalTimeMs: 0,
        totalDurationMs: 0,
        totalPercent: 0,
      };
    }
    const tl = activeScene.timeline;
    const now = tl.time.get();
    const phase = phaseAtTime(tl.ranges, tl.totalDuration, now);
    const range = rangeOf(tl.ranges, phase);
    return {
      sceneId: activeScene.id,
      sceneLabel: activeScene.label,
      phase,
      phaseElapsedMs: Math.max(0, now - range.start),
      phaseDurationMs: range.duration,
      globalTimeMs: now,
      totalDurationMs: tl.totalDuration,
      totalPercent: tl.totalDuration
        ? Math.round((now / tl.totalDuration) * 100)
        : 0,
    };
  }, [activeScene]);

  const pickElement = useCallback(
    (el: Element) => {
      const info = fiberInfo(el);
      const tl = snapshotForActive();
      setDraft({
        kind: 'element',
        element: el,
        snapshot: {
          ...tl,
          selector: elementToSelector(el),
          componentName: info.componentName,
          sourceLocation: info.sourceLocation,
          tagName: el.tagName.toLowerCase(),
        },
      });
    },
    [snapshotForActive],
  );

  const pickRegion = useCallback(
    (region: { x: number; y: number; w: number; h: number }) => {
      const tl = snapshotForActive();
      setDraft({ kind: 'region', region, snapshot: tl });
    },
    [snapshotForActive],
  );

  const commitDraft = useCallback(
    (note: string) => {
      if (!draft) return;
      const sceneId = draft.snapshot.sceneId;
      const annotation: Annotation =
        draft.kind === 'element'
          ? {
              id: makeId(),
              createdAt: new Date().toISOString(),
              note,
              color: COLOR_ELEMENT,
              ...draft.snapshot,
            }
          : {
              id: makeId(),
              createdAt: new Date().toISOString(),
              note,
              color: COLOR_REGION,
              region: draft.region,
              ...draft.snapshot,
            };
      setSceneAnnotations(sceneId, (prev) => [...prev, annotation]);
      setDraft(null);
      setPickerModeState('off');
    },
    [draft, setSceneAnnotations],
  );

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setPickerModeState('off');
  }, []);

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>) => {
      if (!activeSceneId) return;
      setSceneAnnotations(activeSceneId, (prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
    },
    [activeSceneId, setSceneAnnotations],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      if (!activeSceneId) return;
      const sceneId = activeSceneId;
      const before = annotationsBySceneId[sceneId] ?? [];
      if (!before.some((a) => a.id === id)) return;
      setSceneAnnotations(sceneId, (prev) => prev.filter((a) => a.id !== id));
      pushUndo({ sceneId, label: 'Annotation deleted', annotations: before });
    },
    [activeSceneId, annotationsBySceneId, setSceneAnnotations, pushUndo],
  );

  const clearAll = useCallback(() => {
    if (!activeSceneId) return;
    const sceneId = activeSceneId;
    const before = annotationsBySceneId[sceneId] ?? [];
    if (before.length === 0) return;
    setSceneAnnotations(sceneId, () => []);
    pushUndo({
      sceneId,
      label: `Cleared ${before.length} annotation${before.length === 1 ? '' : 's'}`,
      annotations: before,
    });
  }, [activeSceneId, annotationsBySceneId, setSceneAnnotations, pushUndo]);

  const undoLastAction = useCallback(() => {
    if (!undo) return;
    const { sceneId, annotations: snapshot } = undo;
    setSceneAnnotations(sceneId, () => snapshot);
    // The persistence effect only writes the *active* scene. Write the
    // restored scene straight through, in case the user switched scenes
    // during the undo window.
    saveAnnotations(sceneId, snapshot);
    clearUndoTimer();
    setUndo(null);
  }, [undo, setSceneAnnotations, clearUndoTimer]);

  const dismissUndo = useCallback(() => {
    clearUndoTimer();
    setUndo(null);
  }, [clearUndoTimer]);

  const focusAnnotation = useCallback(
    (id: string) => {
      const a = annotations.find((x) => x.id === id);
      if (!a) return undefined;
      if (a.sceneId !== activeSceneId) registry.setActiveSceneId(a.sceneId);
      const target = registry.scenes.find((s) => s.id === a.sceneId);
      if (target) {
        target.timeline.seek(a.globalTimeMs);
        target.timeline.setPaused(true);
      }
      return a;
    },
    [annotations, activeSceneId, registry],
  );

  const value = useMemo<AnnotationsState>(
    () => ({
      annotations,
      visible,
      pickerMode,
      draft,
      setVisible,
      setPickerMode,
      pickElement,
      pickRegion,
      commitDraft,
      cancelDraft,
      updateAnnotation,
      deleteAnnotation,
      clearAll,
      focusAnnotation,
      undo,
      undoLastAction,
      dismissUndo,
    }),
    [
      annotations,
      visible,
      pickerMode,
      draft,
      setPickerMode,
      pickElement,
      pickRegion,
      commitDraft,
      cancelDraft,
      updateAnnotation,
      deleteAnnotation,
      clearAll,
      focusAnnotation,
      undo,
      undoLastAction,
      dismissUndo,
    ],
  );

  return <AnnotationsContext.Provider value={value}>{children}</AnnotationsContext.Provider>;
}

export function useAnnotations(): AnnotationsState {
  const ctx = useContext(AnnotationsContext);
  if (!ctx) throw new Error('useAnnotations must be used inside AnnotationsProvider');
  return ctx;
}

function makeId(): string {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
