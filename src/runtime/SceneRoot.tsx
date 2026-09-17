import { forwardRef, type CSSProperties, type ElementType, type ReactNode, type Ref } from 'react';
import { useOptionalSceneRootRef } from './registry';

/**
 * <SceneRoot> — the recommended wrapper for a Loupe-instrumented scene.
 *
 * Bakes in two invariants consumers used to re-derive by hand:
 *   1. Registers itself with the scene-ref context so registry features
 *      (flash, scroll-to, picker fallback) can locate the scene.
 *   2. Pointer-events: auto whenever Loupe is mounted, so the picker can
 *      hit-test the scene — `document.elementFromPoint` sees through any
 *      ancestor with `pointer-events: none` and would pick the page
 *      underneath. With no `<LoupeRegistryProvider>` above, the default
 *      is `none`, which is what a decorative overlay wants in production.
 *
 *      A scene with interactive content opts out by saying so:
 *
 *        <SceneRoot style={{ pointerEvents: 'auto' }}>
 *
 *      That is honored in production and still overridden to `auto` in
 *      dev, where the picker needs it anyway.
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

  // With Loupe mounted, `auto` wins over whatever the consumer asked for:
  // `document.elementFromPoint` sees straight through a `pointer-events:
  // none` ancestor and picks the page underneath, so a hit-testable root
  // is non-negotiable for the picker.
  //
  // With no Loupe above — production — an explicit choice is honored.
  // The `none` fallback is right for a decorative overlay and wrong for a
  // scene with buttons in it, and before this there was no way to say so:
  // pointerEvents was applied last unconditionally, so a consumer asking
  // for `auto` was silently overridden and shipped a dead subtree.
  const mergedStyle: CSSProperties = {
    ...style,
    pointerEvents: loupeActive ? 'auto' : style?.pointerEvents ?? 'none',
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
