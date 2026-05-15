import { describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { AnnotationsProvider, useAnnotations } from './AnnotationsProvider';
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
