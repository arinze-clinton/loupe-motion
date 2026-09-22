import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import fg from 'fast-glob';
import { resolveSource, type ResolvedScene, type ResolveResult } from '../resolve.js';

/**
 * `loupe resolve [--scene <id>] [--json]` — emit the resolved facts of every
 * timeline-bound scene, so an agent (or the prepare-for-production skill) can
 * convert without doing the arithmetic. See cli/resolve.ts for the model.
 */
export type ResolveOptions = {
  cwd: string;
  json: boolean;
  scene?: string;
};

export async function resolve({ cwd, json, scene }: ResolveOptions): Promise<void> {
  const files = await fg(
    [
      '**/*.{ts,tsx,js,jsx}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
      '!**/.next/**',
      '!**/coverage/**',
    ],
    { cwd, dot: false },
  );

  const scenes: ResolvedScene[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(cwd, file), 'utf8').catch(() => '');
    if (!content.includes('useTimelineValue') && !content.includes('TimelineProvider')) continue;
    const res: ResolveResult = resolveSource(content, file);
    scenes.push(...res.scenes);
    warnings.push(...res.warnings);
  }

  const filtered = scene ? scenes.filter((s) => s.id === scene) : scenes;

  if (json) {
    console.log(JSON.stringify({ scenes: filtered, warnings }, null, 2));
    return;
  }

  printHuman(filtered, warnings, scene);
}

function fmtMs(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

function printHuman(scenes: ResolvedScene[], warnings: string[], wanted?: string) {
  console.log();
  console.log(kleur.bold().cyan('Loupe resolve'));
  console.log();

  if (scenes.length === 0) {
    console.log(
      wanted
        ? kleur.yellow(`  No scene with id "${wanted}" found.`)
        : kleur.yellow('  No timeline-bound scenes found.'),
    );
    console.log();
    for (const w of warnings) console.log(kleur.dim('  ! ' + w));
    return;
  }

  for (const s of scenes) {
    console.log('  ' + kleur.bold(s.id) + (s.label ? kleur.dim(` · ${s.label}`) : ''));
    console.log(
      kleur.dim(
        `  ${s.file} · ${s.phases.length} phases · ${fmtMs(s.totalDuration)} total`,
      ),
    );
    const convertible = s.values.filter((v) => v.convertible);
    const refused = s.values.filter((v) => !v.convertible);
    console.log(
      kleur.dim('  ') +
        kleur.green(`${convertible.length} convertible`) +
        kleur.dim(' · ') +
        (refused.length ? kleur.yellow(`${refused.length} need a human`) : kleur.dim('0 refused')),
    );
    console.log();

    for (const v of convertible) {
      const where = v.property ?? v.variable ?? '(value)';
      const win = `${fmtMs(v.resolvedStartMs!)} → ${fmtMs(v.resolvedEndMs!)}`;
      const zero = v.zeroLength ? kleur.yellow(' [instant]') : '';
      console.log(
        '    ' +
          kleur.green('✓ ') +
          kleur.cyan((v.component ? v.component + '.' : '') + where) +
          kleur.dim(`  ${v.from}→${v.to}  ${win}  ${v.easeName ?? 'curve'}`) +
          zero,
      );
    }
    for (const v of refused) {
      const where = v.property ?? v.variable ?? `L${v.line}`;
      console.log(
        '    ' +
          kleur.yellow('· ') +
          kleur.cyan((v.component ? v.component + '.' : '') + where) +
          kleur.dim('  ' + v.refuse) +
          kleur.dim(` — ${v.reason}`),
      );
    }
    console.log();
  }

  for (const w of warnings) console.log(kleur.dim('  ! ' + w));
  console.log(kleur.dim('  Run with --json for the machine-readable form the skill uses.'));
  console.log();
}
