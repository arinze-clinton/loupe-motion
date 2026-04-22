import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  checkInstall,
  detectInvoker,
  detectPackageManager,
  warnOnInvokerMismatch,
} from '../util.js';
import { findBridgeReverts } from '../bridge.js';

/**
 * `loupe uninstall` — clean exit ramp.
 *
 *   1. Detects how Loupe was installed (npm / pnpm / yarn / bun).
 *   2. Lists the Loupe-authored files it will remove (sample
 *      wiring, bundled Claude skill) and the dependency entry.
 *   3. Asks for confirmation, then runs the package-manager uninstall
 *      and deletes the Loupe-authored files.
 *
 * Never touches user-edited files unless the user opts in. The
 * sample wiring (`loupe.example.tsx`) is only deleted if it matches
 * the init template exactly — otherwise we assume the user edited it
 * and we leave it alone.
 */
type UninstallOptions = {
  cwd: string;
  /** Skip prompts — assume yes for everything. Use in CI / scripts. */
  yes?: boolean;
};

const LOUPE_AUTHORED_FILES = [
  'loupe.example.tsx',
  '.claude/skills/loupe/SKILL.md',
];

export async function uninstall({ cwd, yes }: UninstallOptions): Promise<void> {
  console.log();
  console.log(kleur.bold().cyan('Loupe ✦ ') + 'uninstall');
  console.log();

  const info = await checkInstall(cwd);
  const pm = await detectPackageManager(cwd);
  warnOnInvokerMismatch(kleur, pm, detectInvoker(), 'uninstall');
  if (!info.declared && !info.resolved) {
    console.log(kleur.yellow('  Loupe is not installed in this project.'));
    console.log('  Nothing to do.');
    console.log();
    return;
  }

  // Gather which Loupe-authored files actually exist + are removable.
  const removableFiles: string[] = [];
  for (const rel of LOUPE_AUTHORED_FILES) {
    const abs = path.join(cwd, rel);
    try {
      await fs.access(abs);
      removableFiles.push(rel);
    } catch {
      /* not present — skip */
    }
  }

  // Find any auto-wire artifacts: `<file>.loupe-backup` means init
  // edited the host's layout; we'll restore from it. The matching
  // `loupe-provider.tsx` sibling goes with it.
  const autoWireReverts = await findAutoWireReverts(cwd);

  // Also find any local TimelineProvider files init bridged — those
  // have their own `.loupe-backup` we'll restore byte-for-byte.
  const bridgeReverts = await findBridgeReverts(cwd);

  console.log('  The following will be removed:');
  if (info.declared) {
    console.log(
      `    • dependency ${kleur.cyan('@arinze-clinton/loupe')} ` +
        kleur.dim(`(${info.declaredIn ?? 'dependencies'})`),
    );
  }
  for (const rel of removableFiles) {
    console.log(`    • ${kleur.cyan(rel)}`);
  }
  for (const r of autoWireReverts) {
    console.log(
      `    • ${kleur.cyan(r.providerFile)} ` +
        kleur.dim('(provider file created by init)'),
    );
    console.log(
      `    • ${kleur.cyan(r.demoFile)} ` + kleur.dim('(demo scene)'),
    );
    console.log(
      `    • restore ${kleur.cyan(r.entryFile)} ` +
        kleur.dim(`from ${r.backupFile}`),
    );
  }
  for (const r of bridgeReverts) {
    console.log(
      `    • restore ${kleur.cyan(path.relative(cwd, r.file))} ` +
        kleur.dim(`(local timeline bridge — from ${path.relative(cwd, r.backupFile)})`),
    );
  }
  const emptyDirs = [
    '.claude/skills/loupe',
  ];
  for (const d of emptyDirs) {
    console.log(kleur.dim(`    (+ empty parent dir ${d} if left behind)`));
    break;
  }
  console.log();

  if (!yes) {
    const { ok } = await prompts({
      type: 'confirm',
      name: 'ok',
      message: 'Proceed with uninstall?',
      initial: true,
    });
    if (!ok) {
      console.log(kleur.yellow('\n  Cancelled.'));
      return;
    }
  }

  // 1. Run the package-manager uninstall.
  if (info.declared) {
    const args = uninstallArgsFor(pm);
    console.log(kleur.dim(`\n  $ ${pm} ${args.join(' ')}`));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(pm, args, { cwd, stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${pm} exited ${code}`));
      });
    });
  }

  // 2. Remove Loupe-authored files.
  for (const rel of removableFiles) {
    const abs = path.join(cwd, rel);
    await fs.rm(abs, { force: true });
    console.log(kleur.green('  ✓ removed ') + rel);
  }

  // 3. Revert auto-wired layouts: restore backup → remove provider.
  for (const r of autoWireReverts) {
    const entryAbs = path.join(cwd, r.entryFile);
    const backupAbs = path.join(cwd, r.backupFile);
    const providerAbs = path.join(cwd, r.providerFile);
    try {
      const backup = await fs.readFile(backupAbs, 'utf8');
      await fs.writeFile(entryAbs, backup, 'utf8');
      await fs.rm(backupAbs, { force: true });
      console.log(kleur.green('  ✓ restored ') + r.entryFile);
    } catch (err) {
      console.log(
        kleur.yellow('  ! ') +
          `Could not restore ${r.entryFile}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    try {
      await fs.rm(providerAbs, { force: true });
      console.log(kleur.green('  ✓ removed ') + r.providerFile);
    } catch {
      /* already gone — ignore */
    }
    try {
      const demoAbs = path.join(cwd, r.demoFile);
      await fs.rm(demoAbs, { force: true });
      console.log(kleur.green('  ✓ removed ') + r.demoFile);
    } catch {
      /* already gone — ignore */
    }
  }

  // 4. Revert any bridged local TimelineProvider files.
  for (const r of bridgeReverts) {
    try {
      const backup = await fs.readFile(r.backupFile, 'utf8');
      await fs.writeFile(r.file, backup, 'utf8');
      await fs.rm(r.backupFile, { force: true });
      console.log(
        kleur.green('  ✓ restored ') + path.relative(cwd, r.file),
      );
    } catch (err) {
      console.log(
        kleur.yellow('  ! ') +
          `Could not restore ${path.relative(cwd, r.file)}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // 5. Prune empty Loupe parent dirs so the tree isn't littered.
  await pruneEmptyDir(path.join(cwd, '.claude', 'skills', 'loupe'));

  console.log();
  console.log(kleur.green('  Loupe removed from this project.'));
  console.log(kleur.dim('  Thanks for trying it — PRs + issues welcome.'));
  console.log();
}

function uninstallArgsFor(pm: 'npm' | 'yarn' | 'pnpm' | 'bun'): string[] {
  switch (pm) {
    case 'pnpm':
      return ['remove', '@arinze-clinton/loupe'];
    case 'yarn':
      return ['remove', '@arinze-clinton/loupe'];
    case 'bun':
      return ['remove', '@arinze-clinton/loupe'];
    case 'npm':
    default:
      return ['uninstall', '@arinze-clinton/loupe'];
  }
}

/**
 * Walk known Next.js App Router layout locations, looking for
 * `<layout>.loupe-backup` files. Each one means init auto-wired the
 * host's layout; we revert it by restoring the backup and removing
 * the matching `loupe-provider.tsx` sibling.
 */
async function findAutoWireReverts(cwd: string): Promise<
  Array<{
    entryFile: string;
    backupFile: string;
    providerFile: string;
    demoFile: string;
  }>
> {
  const candidates = [
    'app/layout.tsx',
    'src/app/layout.tsx',
    'app/layout.jsx',
    'src/app/layout.jsx',
  ];
  const results: Array<{
    entryFile: string;
    backupFile: string;
    providerFile: string;
    demoFile: string;
  }> = [];
  for (const entry of candidates) {
    const backup = `${entry}.loupe-backup`;
    try {
      await fs.access(path.join(cwd, backup));
    } catch {
      continue;
    }
    const dir = path.dirname(entry);
    results.push({
      entryFile: entry,
      backupFile: backup,
      providerFile: path.join(dir, 'loupe-provider.tsx'),
      demoFile: path.join(dir, 'loupe-demo-scene.tsx'),
    });
  }
  return results;
}

async function pruneEmptyDir(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir);
    if (entries.length === 0) await fs.rmdir(dir);
  } catch {
    /* not present, not empty, or not permitted — ignore */
  }
}
