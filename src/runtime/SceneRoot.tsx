import { forwardRef, type CSSProperties, type ElementType, type ReactNode, type Ref } from 'react';
import { useOptionalSceneRootRef } from './registry';

/**
 * <SceneRoot> — the recommended wrapper for a Loupe-instrumented scene.
 *
 * Bakes in two invariants consumers used to re-derive by hand:
 *   1. Registers itself with the scene-ref context so registry features
 *      (flash, scroll-to, picker fallback) can locate the scene.
 *   2. Pointer-events: auto whenever Loupe is mounted; pointer-events:
 *      none otherwise. `document.elementFromPoint` sees through any
 *      ancestor with `pointer-events: none`, so a hardcoded `none` on
 *      the scene root makes the picker pick through to the page
 *      underneath. We restore production click-through automatically
 *      when no `<LoupeRegistryProvider>` is mounted above.
 */

interface SceneRootProps {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

export const SceneRoot = forwardRef<HTMLElement, SceneRootProps>(function SceneRoot(
  props,
  forwardedRef,
) {
  const { as, className, style, children, ...rest } = props as SceneRootProps & {
    style?: CSSProperties;
  };
  const Component = (as ?? 'div') as ElementType;
  const sceneRef = useOptionalSceneRootRef();
  const loupeActive = sceneRef !== null;

  const setRef = (node: HTMLElement | null) => {
    if (sceneRef) {
      (sceneRef as React.MutableRefObject<HTMLElement | null>).current = node;
    }
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef)
      (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node;
  };

  // Loupe's pointerEvents goes LAST so a consumer style prop can't
  // accidentally override the picker-rescue behavior.
  const mergedStyle: CSSProperties = {
    ...style,
    pointerEvents: loupeActive ? 'auto' : 'none',
  };

  return (
    <Component
      ref={setRef as Ref<HTMLElement>}
      data-loupe-scene-root=""
      className={className}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </Component>
  );
});

export const SCENE_ROOT_ATTR = 'data-loupe-scene-root';
