/**
 * A single piece of timestamped feedback on a DOM element (or a drawn region).
 *
 * Captured fields are chosen so that pasting into an AI agent gives it enough
 * context to jump straight to the right file + right frame of animation.
 */
export type Annotation = {
  /** Stable id, generated at creation. */
  id: string;
  /** ISO timestamp of when the annotation was created. */
  createdAt: string;

  // ---- Scene context ----
  /** Scene id this annotation belongs to (matches a TimelineProvider config id). */
  sceneId: string;
  /** Human label for the scene (denormalized for export readability). */
  sceneLabel: string;

  // ---- Timeline context ----
  /** Active phase at annotation time. Generic string per scene's vocabulary. */
  phase: string;
  /** ms elapsed inside the phase when the annotation was made. */
  phaseElapsedMs: number;
  /** Phase's total duration (ms). */
  phaseDurationMs: number;
  /** Absolute ms on the scene's loop timeline. */
  globalTimeMs: number;
  /** Scene's total loop duration (ms). */
  totalDurationMs: number;
  /** Rounded percent `globalTimeMs / totalDurationMs`. */
  totalPercent: number;

  // ---- Element context (present for element annotations) ----
  /** Short, human-readable CSS path to the element. Not uniquely-guaranteed. */
  selector?: string;
  /** Resolved React component name (from Fiber), if any. */
  componentName?: string;
  /** Source file path + line, from React Fiber `_debugSource`, if any. */
  sourceLocation?: string;
  /** Raw DOM tag of the picked element. */
  tagName?: string;

  // ---- Region context (present for region annotations) ----
  region?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };

  // ---- User content ----
  note: string;
  color: string;
};

export type AnnotationDraft =
  | {
      kind: 'element';
      element: HTMLElement;
      snapshot: Omit<Annotation, 'note' | 'id' | 'createdAt' | 'color'>;
    }
  | {
      kind: 'region';
      region: { x: number; y: number; w: number; h: number };
      snapshot: Omit<Annotation, 'note' | 'id' | 'createdAt' | 'color' | 'region'>;
    };
