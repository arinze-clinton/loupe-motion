import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, fireEvent } from '@testing-library/react';
import { LoupeRegistryProvider } from '../runtime/registry';
import { TimelineProvider } from '../runtime/TimelineProvider';
import { AnnotationsProvider } from '../annotations/AnnotationsProvider';
import { LoupePanel } from './LoupePanel';
import type { Annotation } from '../annotations/types';

const CONFIG = {
  id: 'panel-scene',
  label: 'Panel',
  phaseOrder: ['enter'] as const,
  phaseDurations: { enter: 200 },
};

const STORAGE_KEY = 'loupe:annotations:v2:panel-scene';

function seed(count: number): Annotation[] {
  const list = Array.from({ length: count }, (_, i) => ({
    id: `seed-${i + 1}`,
    createdAt: new Date(0).toISOString(),
    sceneId: 'panel-scene',
    sceneLabel: 'Panel',
    phase: 'enter',
    phaseElapsedMs: 10,
    phaseDurationMs: 200,
    globalTimeMs: 10,
    totalDurationMs: 200,
    totalPercent: 5,
    selector: '.thing',
    note: `note ${i + 1}`,
    color: '#3A97F9',
  }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
const byText = (t: string) =>
  [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === t);
const undoBar = () => document.querySelector('[role="status"]') as HTMLElement | null;

/**
 * Panel-level regressions for the "clear all" fix.
 *
 * The provider-level tests in `AnnotationsProvider.test.tsx` all passed while
 * the panel was still visibly broken, twice over: the annotations section was
 * gated on `annotations.length > 0`, so clearing unmounted the undo bar along
 * with the list; and the bar was animated in by framer-motion, which left it
 * mounted at `height: 0; opacity: 0` under StrictMode. Both produced exactly
 * the original symptom — a destructive control that appears to do nothing.
 * These tests exercise the rendered panel, not just the hook.
 */
describe('LoupePanel — clear all is visible and undoable', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  async function mount() {
    await act(async () => {
      render(
        <LoupeRegistryProvider>
          <AnnotationsProvider>
            <TimelineProvider config={CONFIG}>
              <LoupePanel />
            </TimelineProvider>
          </AnnotationsProvider>
        </LoupeRegistryProvider>,
      );
    });
  }

  it('clears, shows a visible undo bar, restores on undo, and dismisses', async () => {
    seed(2);
    await mount();
    expect(stored()).toHaveLength(2);

    // --- both controls are real, focusable buttons (were <span onClick>) ---
    const clear = byText('clear all');
    const copy = byText('copy feedback');
    for (const b of [clear, copy]) {
      expect(b?.tagName).toBe('BUTTON');
      expect(b?.getAttribute('type')).toBe('button');
      // A <button> nested inside a <button> is invalid and gets dropped.
      expect(b?.closest('button')).toBe(b);
    }

    // --- clear ---
    act(() => {
      fireEvent.click(byText('clear all')!);
    });
    expect(stored()).toHaveLength(0);

    const bar = undoBar();
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('Cleared 2 annotations');
    // The section must stay mounted once the list empties, and the bar must
    // not be left zero-height or transparent — both produced a bar that was
    // in the DOM but invisible, i.e. the original silent failure.
    expect(bar!.style.opacity).not.toBe('0');
    expect(bar!.style.height).not.toBe('0px');

    // --- undo restores, in order ---
    act(() => {
      fireEvent.click(byText('undo')!);
    });
    expect(stored().map((a: Annotation) => a.note)).toEqual(['note 1', 'note 2']);
    expect(undoBar()).toBeNull();

    // --- clear again, then dismiss ---
    act(() => {
      fireEvent.click(byText('clear all')!);
    });
    const dismiss = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'Dismiss',
    );
    act(() => {
      fireEvent.click(dismiss!);
    });
    expect(undoBar()).toBeNull();
    expect(stored()).toHaveLength(0);
  });
});
