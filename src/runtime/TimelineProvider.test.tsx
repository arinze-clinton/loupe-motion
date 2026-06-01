import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import { TimelineProvider } from './TimelineProvider';
import {
  LoupeRegistryProvider,
  useLoupeRegistry,
  useSceneRootRef,
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

// Consumer that attaches the scene-root ref to its own element via
// `useSceneRootRef()` — the supported way to give the registry a
// real DOM node to flash / scroll to (the provider no longer wraps
// children itself).
function SceneConsumer() {
  const ref = useSceneRootRef();
  return (
    <div ref={ref as React.Ref<HTMLDivElement>} data-testid="scene-child">
      hello
    </div>
  );
}

describe('TimelineProvider', () => {
  it('registers a scene whose rootRef resolves once a consumer attaches it', async () => {
    let captured: RegisteredScene[] = [];

    await act(async () => {
      render(
        <LoupeRegistryProvider>
          <CaptureScenes onScenes={(s) => (captured = s)} />
          <TimelineProvider config={CONFIG}>
            <SceneConsumer />
          </TimelineProvider>
        </LoupeRegistryProvider>,
      );
    });

    expect(captured).toHaveLength(1);
    const scene = captured[0]!;
    expect(scene.id).toBe('test-scene');

    // The provider hands consumers a ref via `useSceneRootRef()`.
    // Once attached, `scene.rootRef.current` is the consumer's real
    // element — that's what SceneFlashOverlay measures / scrolls to.
    expect(scene.rootRef.current).not.toBeNull();
    expect(scene.rootRef.current).toBeInstanceOf(Element);
    expect((scene.rootRef.current as HTMLElement).dataset.testid).toBe(
      'scene-child',
    );
  });

  it('renders scene children directly, without an extra wrapper element', async () => {
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

    // The provider deliberately does NOT insert a `display: contents`
    // wrapper (it broke `useInView` / IntersectionObserver, which
    // treats contents elements as having no layout box). Children
    // mount straight under the render container.
    const child = dom!.querySelector('[data-testid="child"]') as HTMLElement;
    expect(child).not.toBeNull();
    expect(child.parentElement).toBe(dom!);
  });
});
