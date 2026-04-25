import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import { TimelineProvider } from './TimelineProvider';
import {
  LoupeRegistryProvider,
  useLoupeRegistry,
  type RegisteredScene,
} from './registry';

function CaptureScenes({
  onScenes,
}: {
  onScenes: (scenes: RegisteredScene[]) => void;
}) {
  const reg = useLoupeRegistry();
  useEffect(() => {
    onScenes(reg.scenes);
  }, [reg.scenes, onScenes]);
  return null;
}

const CONFIG = {
  id: 'test-scene',
  label: 'Test',
  phaseOrder: ['idle', 'enter'] as const,
  phaseDurations: { idle: 100, enter: 200 },
};

describe('TimelineProvider', () => {
  it('registers a scene whose rootRef points at a real DOM element', async () => {
    let captured: RegisteredScene[] = [];

    await act(async () => {
      render(
        <LoupeRegistryProvider>
          <CaptureScenes onScenes={(s) => (captured = s)} />
          <TimelineProvider config={CONFIG}>
            <div data-testid="scene-child">hello</div>
          </TimelineProvider>
        </LoupeRegistryProvider>,
      );
    });

    expect(captured).toHaveLength(1);
    const scene = captured[0]!;
    expect(scene.id).toBe('test-scene');

    // Regression: previously `sceneRootRef` was never attached to a
    // DOM node, so `scene.rootRef.current` stayed null forever and
    // SceneFlashOverlay's scrollIntoView/measure was a silent no-op.
    expect(scene.rootRef.current).not.toBeNull();
    expect(scene.rootRef.current).toBeInstanceOf(Element);
  });

  it('keeps scene children rendered as a layout-invisible wrapper', async () => {
    let dom: HTMLElement;
    await act(async () => {
      const { container } = render(
        <LoupeRegistryProvider>
          <TimelineProvider config={CONFIG}>
            <div data-testid="child">hi</div>
          </TimelineProvider>
        </LoupeRegistryProvider>,
      );
      dom = container;
    });

    // The wrapper div uses `display: contents` so any flex/grid layout
    // a host applies still sees the scene's content as a direct child
    // rather than getting pushed inside an extra block-level box.
    const child = dom!.querySelector('[data-testid="child"]') as HTMLElement;
    expect(child).not.toBeNull();
    const wrapper = child.parentElement!;
    expect(wrapper.style.display).toBe('contents');
  });
});
