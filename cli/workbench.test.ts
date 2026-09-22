import { describe, it, expect } from 'vitest';
import { workbenchFiles, WORKBENCH_MARKER, DEFAULT_WORKBENCH_DIR } from './workbench.js';

/**
 * The workbench scaffold is verified end-to-end by actually running it in a
 * browser during development; these tests pin the contract so it can't
 * silently regress — the files it writes, and the provider nesting the panel
 * needs (a missing AnnotationsProvider crashed the first cut, caught only by
 * running it).
 */

describe('workbenchFiles', () => {
  const files = workbenchFiles(DEFAULT_WORKBENCH_DIR, '0.7.0');
  const byPath = new Map(files.map((f) => [f.path, f.contents]));

  it('scaffolds the full standalone Vite app plus a root marker', () => {
    const paths = files.map((f) => f.path).sort();
    expect(paths).toContain('loupe-workbench/package.json');
    expect(paths).toContain('loupe-workbench/vite.config.ts');
    expect(paths).toContain('loupe-workbench/index.html');
    expect(paths).toContain('loupe-workbench/main.tsx');
    expect(paths).toContain('loupe-workbench/workbench-scene.tsx');
    expect(paths).toContain(WORKBENCH_MARKER);
  });

  it('nests the providers the panel requires (Registry > Annotations > panel)', () => {
    const main = byPath.get('loupe-workbench/main.tsx')!;
    // The panel calls useAnnotations; without AnnotationsProvider it throws at
    // mount. Pin all three, and the order.
    expect(main).toContain('LoupeRegistryProvider');
    expect(main).toContain('AnnotationsProvider');
    expect(main).toContain('LoupePanel');
    expect(main.indexOf('LoupeRegistryProvider')).toBeLessThan(main.indexOf('AnnotationsProvider'));
    expect(main.indexOf('AnnotationsProvider')).toBeLessThan(main.indexOf('LoupePanel'));
  });

  it('starts from a real timeline-bound scene, not an empty page', () => {
    const scene = byPath.get('loupe-workbench/workbench-scene.tsx')!;
    expect(scene).toContain('TimelineProvider');
    expect(scene).toContain('useTimelineValue');
    expect(scene).toContain('SceneRoot');
  });

  it('records the workbench dir in the marker for mode detection', () => {
    const marker = JSON.parse(byPath.get(WORKBENCH_MARKER)!);
    expect(marker.dir).toBe(DEFAULT_WORKBENCH_DIR);
    expect(marker.loupeVersion).toBe('0.7.0');
  });

  it('honors a custom name', () => {
    const custom = workbenchFiles('motion-lab', '0.7.0');
    expect(custom.some((f) => f.path === 'motion-lab/main.tsx')).toBe(true);
    expect(JSON.parse(custom.find((f) => f.path === WORKBENCH_MARKER)!.contents).dir).toBe('motion-lab');
  });
});
