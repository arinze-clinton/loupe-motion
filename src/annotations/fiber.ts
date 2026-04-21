/**
 * React Fiber introspection for Loupe annotations.
 *
 * Walks up from a DOM node's attached Fiber to find the nearest user-defined
 * component and returns its displayName + source file (from `_debugSource`
 * in dev builds). Same approach as React DevTools — uses the `__reactFiber$`
 * key React attaches to each DOM node. Undocumented but stable across React 16–19.
 */

type FiberNode = {
  type?: unknown;
  elementType?: unknown;
  return?: FiberNode;
  stateNode?: unknown;
  memoizedProps?: unknown;
  _debugSource?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  _debugOwner?: FiberNode;
};

export type FiberInfo = {
  componentName?: string;
  sourceLocation?: string;
};

export function fiberInfo(el: HTMLElement | null): FiberInfo {
  if (!el) return {};
  const fiber = getFiber(el);
  if (!fiber) return {};
  let current: FiberNode | undefined = fiber;
  let componentName: string | undefined;
  let sourceLocation: string | undefined;
  for (let i = 0; i < 12 && current; i++) {
    const name = componentNameFor(current);
    if (name && !componentName) {
      componentName = name;
      sourceLocation = formatDebugSource(current._debugSource);
      if (sourceLocation) break;
    }
    current = current.return;
  }
  return { componentName, sourceLocation };
}

function getFiber(el: HTMLElement): FiberNode | undefined {
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  if (!key) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (el as any)[key] as FiberNode;
}

function componentNameFor(fiber: FiberNode): string | undefined {
  const type = (fiber.type ?? fiber.elementType) as unknown;
  if (!type) return undefined;
  if (typeof type === 'string') return undefined;
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || undefined;
  }
  if (typeof type === 'object' && type !== null) {
    const obj = type as {
      displayName?: string;
      render?: { displayName?: string; name?: string };
      type?: { displayName?: string; name?: string };
    };
    if (obj.displayName) return obj.displayName;
    if (obj.render) return obj.render.displayName || obj.render.name;
    if (obj.type) return obj.type.displayName || obj.type.name;
  }
  return undefined;
}

function formatDebugSource(src: FiberNode['_debugSource']): string | undefined {
  if (!src || !src.fileName) return undefined;
  const file = src.fileName;
  const srcIdx = file.lastIndexOf('/src/');
  const rel = srcIdx !== -1 ? file.slice(srcIdx + 1) : file;
  return src.lineNumber ? `${rel}:${src.lineNumber}` : rel;
}
