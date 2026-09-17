import path from 'node:path';
import { fileURLToPath } from 'node:url';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  planSkillSync,
  writeSkillFile,
  type SkillPlanEntry,
} from '../skills.js';

// tsup ships this file as ESM; `__dirname` isn't defined there.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `loupe skills` — install or refresh the bundled Claude skills.
 *
 * `init` can't do this job. It returns early for anyone who already has
 * Loupe in package.json (behind a confirm defaulting to no), and its
 * file writer prompts "exists — overwrite?" also defaulting to no. So an
 * existing user never receives a new skill or a corrected one.
 *
 * This command writes without asking when there's nothing to lose — the
 * file is missing, or already byte-identical — and only asks when the
 * copy on disk genuinely differs, keeping a `.loupe-backup` either way.
 */
export type SkillsOptions = {
  cwd: string;
  /** Overwrite edited files without asking. */
  force?: boolean;
  /** Report what would change, write nothing. */
  dryRun?: boolean;
};

export async function skills({ cwd, force, dryRun }: SkillsOptions): Promise<void> {
  console.log();
  console.log(kleur.bold().cyan('Loupe ✦ ') + 'skills');
  console.log();

  const skillRoot = path.resolve(__dirname, '..', '..', 'skill');
  const plan = await planSkillSync(cwd, skillRoot);

  const missing = plan.filter((e) => e.status === 'missing-source');
  for (const entry of missing) {
    console.log(
      kleur.yellow('  ! ') +
        `${entry.file.src} is missing from the package — skipped.`,
    );
  }

  const actionable = plan.filter(
    (e) => e.status === 'create' || e.status === 'differs',
  );
  const identical = plan.filter((e) => e.status === 'identical');

  for (const entry of identical) {
    console.log(kleur.dim('  · ') + kleur.dim(`${entry.file.dest} — already current`));
  }

  if (actionable.length === 0) {
    console.log();
    console.log(
      missing.length > 0
        ? kleur.yellow('  Nothing to write.')
        : kleur.green('  Skills are up to date.'),
    );
    console.log();
    return;
  }

  // A dry run must not ask anything — it reports what *would* happen.
  // Prompting here would block the user on a decision about work that is
  // never going to be done.
  if (dryRun) {
    console.log();
    for (const entry of actionable) {
      console.log(
        kleur.cyan('  ~ ') +
          `${entry.file.dest} — would ${entry.status === 'create' ? 'install' : 'update'}` +
          (entry.status === 'differs'
            ? kleur.dim(' (would ask first, and keep a .loupe-backup)')
            : ''),
      );
    }
    console.log();
    console.log(kleur.dim('  Dry run — nothing written.'));
    console.log();
    return;
  }

  const approved: SkillPlanEntry[] = [];
  for (const entry of actionable) {
    if (entry.status === 'create') {
      approved.push(entry);
      continue;
    }
    // `differs` — the user may have edited it. Default to yes, because
    // these are Loupe-authored files and the shipped copy is the current
    // one, but never clobber without a backup.
    if (force) {
      approved.push(entry);
      continue;
    }
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `${entry.file.dest} differs from the version Loupe ships — update it? (a .loupe-backup is kept)`,
      initial: true,
    });
    if (overwrite) approved.push(entry);
    else console.log(kleur.dim('  · ') + kleur.dim(`${entry.file.dest} — left as-is`));
  }

  let written = 0;
  for (const entry of approved) {
    const { written: didWrite, backup } = await writeSkillFile(cwd, entry);
    if (!didWrite) continue;
    written += 1;
    const suffix = backup
      ? kleur.dim(` (backup: ${path.relative(cwd, backup)})`)
      : '';
    console.log(
      kleur.green('  ✓ ') +
        entry.file.dest +
        kleur.dim(entry.status === 'create' ? ' — installed' : ' — updated') +
        suffix,
    );
  }

  console.log();
  console.log(
    written === 0
      ? kleur.dim('  Nothing written.')
      : kleur.green(`  ${written} skill file${written === 1 ? '' : 's'} written.`),
  );
  console.log();
}
