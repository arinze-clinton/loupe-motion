import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRef, useEffect } from 'react';
import { TimelineProvider } from './TimelineProvider';
import { LoupeRegistryProvider, useSceneRootRef } from './registry';
import { SceneRoot } from './SceneRoot';

const CONFIG = {
  id: 'sr-scene',
  label: 'SR',
  phaseOrder: ['idle', 'enter'] as const,
  phaseDurations: { idle: 100, enter: 200 },
};

describe('SceneRoot', () => {
  it('sets pointer-events: auto when Loupe registry is mounted', () => {
    const { container } = render(
      <LoupeRegistryProvider>
        <TimelineProvider config={CONFIG}>
          <SceneRoot data-testid="root">
            <div>child</div>
          </SceneRoot>
        </TimelineProvider>
      </LoupeRegistryProvider>,
    );
    const root = container.querySelector('[data-loupe-scene-root]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.pointerEvents).toBe('auto');
  });

  it('sets pointer-events: none when no scene-ref context is provided', () => {
    // No <TimelineProvider> above — SceneRoot should default to the
    // production-safe click-through behavior.
    const { container } = render(
      <SceneRoot>
        <div>child</div>
      </SceneRoot>,
    );
    const root = container.querySelector('[data-loupe-scene-root]') as HTMLElement;
    expect(root.style.pointerEvents).toBe('none');
  });

  it('auto-rescues a bare-div scene that hardcodes pointer-events: none', async () => {
    // Pre-fix bug: a scene wrapped in a div with `pointer-events: none`
    // was invisible to the picker. The registry should now patch it to
    // `auto` on registration so existing code is rescued without changes.
    function Bare() {
      const ref = useSceneRootRef();
      return (
        <div
          ref={ref as React.Ref<HTMLDivElement>}
          data-testid="bare"
          style={{ pointerEvents: 'none' }}
        >
          x
        </div>
      );
    }
    let container!: HTMLElement;
    await act(async () => {
      const r = render(
        <LoupeRegistryProvider>
          <TimelineProvider config={CONFIG}>
            <Bare />
          </TimelineProvider>
        </LoupeRegistryProvider>,
      );
      container = r.container;
    });
    const el = container.querySelector('[data-testid="bare"]') as HTMLElement;
    expect(el.style.pointerEvents).toBe('auto');
  });

  it('lets consumer styles through but pins pointer-events last', () => {
    const { container } = render(
      <LoupeRegistryProvider>
        <TimelineProvider config={CONFIG}>
          <SceneRoot
            style={{ background: 'red', pointerEvents: 'none' }}
          >
            <div>child</div>
          </SceneRoot>
        </TimelineProvider>
      </LoupeRegistryProvider>,
    );
    const root = container.querySelector('[data-loupe-scene-root]') as HTMLElement;
    expect(root.style.background).toBe('red');
    // Loupe override wins regardless of what the consumer passed.
    expect(root.style.pointerEvents).toBe('auto');
  });
});
