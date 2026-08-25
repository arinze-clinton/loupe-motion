import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { AnnotationsProvider, useAnnotations, UNDO_WINDOW_MS } from './AnnotationsProvider';
import { LoupeRegistryProvider } from '../runtime/registry';
import { TimelineProvider } from '../runtime/TimelineProvider';

const CONFIG = {
  id: 'svg-scene',
  label: 'SVG',
  phaseOrder: ['enter'] as const,
  phaseDurations: { enter: 200 },
};

/**
 * Regression: SVG elements (paper paths, circles, strokes inside an animated
 * `<svg>`) must be pickable. The picker chain was once typed as `HTMLElement`,
 * which silently rejected every SVGElement — `<path>` and friends inherit
 * from `Element` only, not from `HTMLElement`. If anyone tightens the type
 * back, this test fails.
 */
describe('AnnotationsProvider — SVG picking regression', () => {
  it('pickElement accepts an SVGElement and stores it on the draft', async () => {
    const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let captured: ReturnType<typeof useAnnotations> | null = null;

    function Grab() {
      const api = useAnnotations();
      useEffect(() => {
        captured = api;
      });
      return null;
    }

    await act(async () => {
      render(
        <LoupeRegistryProvider>
          <AnnotationsProvider>
            <TimelineProvider config={CONFIG}>
              <Grab />
            </TimelineProvider>
          </AnnotationsProvider>
        </LoupeRegistryProvider>,
      );
    });

    await act(async () => {
      captured!.pickElement(svgPath);
    });

    expect(captured!.draft).not.toBeNull();
    expect(captured!.draft?.kind).toBe('element');
    if (captured!.draft?.kind === 'element') {
      expect(captured!.draft.element).toBe(svgPath);
      expect(captured!.draft.snapshot.tagName).toBe('path');
    }
  });
});

/**
 * Regression: destructive annotation actions must not depend on
 * `window.confirm()`.
 *
 * `confirm()` returns `false` *immediately and without showing anything* when
 * the browser suppresses dialogs — Chrome's sticky "prevent this page from
 * creating additional dialogs" checkbox, or any sandboxed iframe lacking
 * `allow-modals`. The old handler read that `false` as "user cancelled", so
 * "clear all" silently did nothing. These tests pin `confirm` to `false` for
 * the whole suite: if anyone reintroduces a confirm gate, they fail.
 */
describe('AnnotationsProvider — destructive actions without confirm()', () => {
  let confirmSpy: MockInstance;

  beforeEach(() => {
    window.localStorage.clear();
    // The suppressed-dialog browser: always false, never any UI.
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    vi.useRealTimers();
  });

  async function mount() {
    let api: ReturnType<typeof useAnnotations> | null = null;
    function Grab() {
      const a = useAnnotations();
      useEffect(() => {
        api = a;
      });
      return null;
    }
    await act(async () => {
      render(
        <LoupeRegistryProvider>
          <AnnotationsProvider>
            <TimelineProvider config={CONFIG}>
              <Grab />
            </TimelineProvider>
          </AnnotationsProvider>
        </LoupeRegistryProvider>,
      );
    });
    return () => api!;
  }

  async function addAnnotation(get: () => ReturnType<typeof useAnnotations>, note: string) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    await act(async () => {
      get().pickElement(el);
    });
    await act(async () => {
      get().commitDraft(note);
    });
  }

  it('clearAll empties the active scene even when confirm() is suppressed', async () => {
    const get = await mount();
    await addAnnotation(get, 'first');
    await addAnnotation(get, 'second');
    expect(get().annotations).toHaveLength(2);

    await act(async () => {
      get().clearAll();
    });

    expect(get().annotations).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      JSON.parse(window.localStorage.getItem('loupe:annotations:v2:svg-scene') ?? '[]'),
    ).toEqual([]);
  });

  it('offers an undo entry that restores the cleared annotations', async () => {
    const get = await mount();
    await addAnnotation(get, 'first');
    await addAnnotation(get, 'second');

    await act(async () => {
      get().clearAll();
    });
    expect(get().undo).not.toBeNull();
    expect(get().undo?.sceneId).toBe('svg-scene');
    expect(get().undo?.label).toBe('Cleared 2 annotations');

    await act(async () => {
      get().undoLastAction();
    });

    expect(get().annotations).toHaveLength(2);
    expect(get().annotations.map((a) => a.note)).toEqual(['first', 'second']);
    expect(get().undo).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem('loupe:annotations:v2:svg-scene') ?? '[]'),
    ).toHaveLength(2);
  });

  it('expires the undo entry after the undo window', async () => {
    const get = await mount();
    await addAnnotation(get, 'first');
    await act(async () => {
      get().clearAll();
    });
    expect(get().undo).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    });

    expect(get().undo).toBeNull();
    expect(get().annotations).toHaveLength(0);
  });

  it('deleteAnnotation removes one annotation and is undoable', async () => {
    const get = await mount();
    await addAnnotation(get, 'first');
    await addAnnotation(get, 'second');
    const targetId = get().annotations[0].id;

    await act(async () => {
      get().deleteAnnotation(targetId);
    });

    expect(get().annotations.map((a) => a.note)).toEqual(['second']);
    expect(confirmSpy).not.toHaveBeenCalled();

    await act(async () => {
      get().undoLastAction();
    });
    expect(get().annotations.map((a) => a.note)).toEqual(['first', 'second']);
  });

  it('clearAll on an empty scene is a no-op and offers nothing to undo', async () => {
    const get = await mount();
    await act(async () => {
      get().clearAll();
    });
    expect(get().annotations).toHaveLength(0);
    expect(get().undo).toBeNull();
  });
});
