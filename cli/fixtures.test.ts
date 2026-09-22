import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSource } from './resolve.js';

/**
 * Golden safety net: run `resolve` against the REAL example scenes and pin the
 * result. resolve.test.ts covers behaviors in isolation; this catches drift in
 * the actual scenes we ship and demo — if someone changes a hook, the phase
 * model, or a scene and the resolved facts shift, this fails loudly.
 *
 * Uses the real files rather than copies so the fixtures can't rot out of sync
 * with what users actually see.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const scenesDir = path.resolve(here, '..', 'examples', 'landing', 'src', 'scenes');

async function resolveScene(fileBase: string) {
  const src = await fs.readFile(path.join(scenesDir, fileBase), 'utf8');
  const res = resolveSource(src, fileBase);
  return res;
}

type Golden = { id: string; convertible: number; refused: number; totalDuration: number };

const GOLDEN: Record<string, Golden> = {
  'HeroScene.tsx': { id: 'harbor:checklist', convertible: 5, refused: 6, totalDuration: 4400 },
  'CtaScene.tsx': { id: 'harbor:insights', convertible: 3, refused: 1, totalDuration: 3300 },
  'FeaturesScene.tsx': { id: 'harbor:schedule', convertible: 0, refused: 3, totalDuration: 3700 },
  'PublishScene.tsx': { id: 'harbor:publish', convertible: 0, refused: 0, totalDuration: 2700 },
};

describe('resolve — golden output on the real landing scenes', () => {
  for (const [file, g] of Object.entries(GOLDEN)) {
    it(`${file} → ${g.id} (${g.convertible} convertible, ${g.refused} refused)`, async () => {
      const res = await resolveScene(file);
      expect(res.scenes).toHaveLength(1);
      const scene = res.scenes[0]!;
      expect(scene.id).toBe(g.id);
      expect(scene.totalDuration).toBe(g.totalDuration);
      expect(scene.values.filter((v) => v.convertible)).toHaveLength(g.convertible);
      expect(scene.values.filter((v) => !v.convertible)).toHaveLength(g.refused);
    });
  }

  it('resolves ProgressPill.opacity in the checklist to 2500–2800ms', async () => {
    const res = await resolveScene('HeroScene.tsx');
    const v = res.scenes[0]!.values.find(
      (v) => v.component === 'ProgressPill' && v.property === 'opacity',
    );
    expect(v).toBeDefined();
    expect(v!.convertible).toBe(true);
    expect(v!.resolvedStartMs).toBe(2500);
    expect(v!.resolvedEndMs).toBe(2800);
    expect(v!.easeName).toBe('HOUSE_CURVE_FN');
  });

  it('refuses the checklist rows for the documented reasons', async () => {
    const res = await resolveScene('HeroScene.tsx');
    const codes = res.scenes[0]!.values
      .filter((v) => !v.convertible)
      .map((v) => v.refuse);
    // ChecklistRow: 3 non-literal-phase + 3 conditional-from-to
    expect(codes.filter((c) => c === 'non-literal-phase')).toHaveLength(3);
    expect(codes.filter((c) => c === 'conditional-from-to')).toHaveLength(3);
  });
});
