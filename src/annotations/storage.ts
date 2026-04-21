import type { Annotation } from './types';

/**
 * localStorage-backed persistence for Loupe annotations, keyed per scene.
 *   loupe:annotations:v2:{sceneId}  →  Annotation[]
 */

const KEY_PREFIX = 'loupe:annotations:v2:';

function keyFor(sceneId: string): string {
  return `${KEY_PREFIX}${sceneId}`;
}

export function loadAnnotations(sceneId: string): Annotation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(keyFor(sceneId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Annotation[];
    }
    return [];
  } catch {
    return [];
  }
}

export function saveAnnotations(sceneId: string, list: Annotation[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(sceneId), JSON.stringify(list));
  } catch {
    // Private-mode Safari / quota exceeded — silently drop.
  }
}

export function clearAnnotationsForScene(sceneId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(sceneId));
  } catch {
    // ignore
  }
}
