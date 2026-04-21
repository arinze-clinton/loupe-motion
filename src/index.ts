// Runtime — every consumer needs this.
export { TimelineProvider, useTimeline, type TimelineState } from './runtime/TimelineProvider';
export {
  useTimelineTime,
  useRangeOf,
  useTimelineValue,
  usePhaseFromTime,
  usePhaseEnterKey,
} from './runtime/hooks';
export {
  HOUSE_CURVE_FN,
  SETTLE_CURVE_FN,
  computeRanges,
  totalDurationFor,
  rangeOf,
  phaseAtTime,
  type SceneConfig,
  type PhaseRange,
} from './runtime/phases';

// Registry — wraps the app, lets the panel see every mounted scene.
export {
  LoupeRegistryProvider,
  useLoupeRegistry,
  useOptionalLoupeRegistry,
  useSceneRootRef,
  type RegisteredScene,
  type RegisteredTimeline,
} from './runtime/registry';

// Panel — the floating dev UI.
export { LoupePanel } from './panel/LoupePanel';

// Annotations — provider + visual layers.
export {
  AnnotationsProvider,
  useAnnotations,
  type PickerMode,
} from './annotations/AnnotationsProvider';
export { AnnotationOverlay } from './annotations/AnnotationOverlay';
export { AnnotationPins } from './annotations/AnnotationPins';
export { annotationsToMarkdown } from './annotations/export';
export type { Annotation, AnnotationDraft } from './annotations/types';
