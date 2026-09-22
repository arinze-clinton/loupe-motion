import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import { workbenchFiles, DEFAULT_WORKBENCH_DIR } from '../workbench.js';
import { LOUPE_VERSION } from '../util.js';

/**
 * `loupe workbench [--name <dir>]` — scaffold a standalone Vite page for
 * building an animation in isolation. See cli/workbench.ts for the why.
 *
 * Never clobbers: a file that already exists is left as-is and reported, so
 * re-running is safe and won't wipe edits.
 */
export type WorkbenchOptions = {
  cwd: string;
  name?: string;
};

export async function workbench({ cwd, name }: WorkbenchOptions): Promise<void> {
  const dir = name || DEFAULT_WORKBENCH_DIR;
  console.log();
  console.log(kleur.bold().cyan('Loupe ✦ ') + 'workbench');
  console.log();

  const files = workbenchFiles(dir, LOUPE_VERSION);
  let written = 0;
  let skipped = 0;
  for (const f of files) {
    const abs = path.join(cwd, f.path);
    let exists = false;
    try {
      await fs.access(abs);
      exists = true;
    } catch {
      /* doesn't exist */
    }
    if (exists) {
      console.log(kleur.dim('  · ') + kleur.dim(`${f.path} — kept (already there)`));
      skipped += 1;
      continue;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, f.contents, 'utf8');
    console.log(kleur.green('  ✓ ') + f.path);
    written += 1;
  }

  console.log();
  if (written === 0) {
    console.log(kleur.yellow(`  Workbench already scaffolded in ${dir}/.`));
  } else {
    console.log(kleur.green(`  Workbench ready in ${dir}/.`));
  }
  console.log();
  console.log(kleur.bold('  Run it'));
  console.log(kleur.dim('    cd ') + kleur.cyan(dir) + kleur.dim(' && npm install && npm run dev'));
  console.log();
  console.log(
    kleur.dim('  Build your animation in ') +
      kleur.cyan(`${dir}/workbench-scene.tsx`) +
      kleur.dim(', scrub it with the panel, then ask your agent to'),
  );
  console.log(kleur.dim('  "prepare this workbench scene for production".'));
  console.log();
}
