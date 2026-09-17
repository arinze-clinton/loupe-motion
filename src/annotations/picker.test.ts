import { describe, it, expect, afterEach } from 'vitest';
import { manualHitTest } from './AnnotationOverlay';

/**
 * Regression: an element inside a `pointer-events: none` wrapper must stay
 * pickable.
 *
 * `document.elementsFromPoint` omits anything under such a wrapper, so the
 * first hit the picker saw was an ANCESTOR of the thing being pointed at —
 * in practice the scene root, which the registry forces back to `auto`.
 * The picker accepted it and stopped, so hovering a small item highlighted
 * the whole scene and the item could never be selected. The manual-fallback
 * path never rescued it either: that only runs when nothing in the hit-stack
 * belongs to a scene, and the scene root does.
 *
 * `manualHitTest` ignores pointer-events and returns the smallest visible
 * element containing the point, so descending into whatever the hit-stack
 * returned recovers the real target.
 *
 * happy-dom has no layout engine, so rects are stubbed per element.
 */

type Rect = { left: number; top: number; width: number; height: number };

function rect(el: Element, r: Rect) {
  el.getBoundingClientRect = () =>
    ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      right: r.left + r.width,
      bottom: r.top + r.height,
      x: r.left,
      y: r.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('manualHitTest', () => {
  it('finds a target buried under a pointer-events: none wrapper', () => {
    document.body.innerHTML = `
      <div id="sceneRoot">
        <div id="wrap" style="pointer-events: none">
          <div id="item">item</div>
        </div>
      </div>`;
    const root = document.getElementById('sceneRoot')!;
    const wrap = document.getElementById('wrap')!;
    const item = document.getElementById('item')!;
    rect(root, { left: 100, top: 100, width: 300, height: 200 });
    rect(wrap, { left: 100, top: 100, width: 300, height: 200 });
    rect(item, { left: 120, top: 120, width: 80, height: 40 });

    // Descending from the scene root — which is what the hit-stack returns
    // when the wrapper blocks hit-testing — must reach the item.
    expect(manualHitTest(root, 160, 140)).toBe(item);
  });

  it('returns the root itself when the point misses every child', () => {
    document.body.innerHTML = `<div id="sceneRoot"><div id="item"></div></div>`;
    const root = document.getElementById('sceneRoot')!;
    const item = document.getElementById('item')!;
    rect(root, { left: 100, top: 100, width: 300, height: 200 });
    rect(item, { left: 120, top: 120, width: 80, height: 40 });

    expect(manualHitTest(root, 380, 280)).toBe(root);
  });

  it('returns null when the point is outside the root', () => {
    document.body.innerHTML = `<div id="sceneRoot"></div>`;
    const root = document.getElementById('sceneRoot')!;
    rect(root, { left: 100, top: 100, width: 300, height: 200 });

    expect(manualHitTest(root, 10, 10)).toBeNull();
  });

  it('prefers the deepest (smallest) hit, like the browser would', () => {
    document.body.innerHTML = `
      <div id="sceneRoot"><div id="mid"><div id="leaf"></div></div></div>`;
    const root = document.getElementById('sceneRoot')!;
    const mid = document.getElementById('mid')!;
    const leaf = document.getElementById('leaf')!;
    rect(root, { left: 0, top: 0, width: 400, height: 400 });
    rect(mid, { left: 0, top: 0, width: 200, height: 200 });
    rect(leaf, { left: 0, top: 0, width: 50, height: 50 });

    expect(manualHitTest(root, 25, 25)).toBe(leaf);
  });

  it("never returns Loupe's own UI", () => {
    document.body.innerHTML = `
      <div id="sceneRoot"><div id="panel" data-loupe-ui><div id="inner"></div></div></div>`;
    const root = document.getElementById('sceneRoot')!;
    const panel = document.getElementById('panel')!;
    const inner = document.getElementById('inner')!;
    rect(root, { left: 0, top: 0, width: 400, height: 400 });
    rect(panel, { left: 0, top: 0, width: 100, height: 100 });
    rect(inner, { left: 0, top: 0, width: 50, height: 50 });

    expect(manualHitTest(root, 25, 25)).toBe(root);
  });

  it('skips zero-size elements', () => {
    document.body.innerHTML = `<div id="sceneRoot"><div id="empty"></div></div>`;
    const root = document.getElementById('sceneRoot')!;
    const empty = document.getElementById('empty')!;
    rect(root, { left: 0, top: 0, width: 400, height: 400 });
    rect(empty, { left: 0, top: 0, width: 0, height: 0 });

    expect(manualHitTest(root, 10, 10)).toBe(root);
  });
});
