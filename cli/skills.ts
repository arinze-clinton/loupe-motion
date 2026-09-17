import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Skill-file sync for `loupe skills`.
 *
 * `init` writes skill files through `writeIfMissing`, which prompts
 * "exists — overwrite?" defaulting to NO, and `init` itself returns early
 * for anyone who already has Loupe installed. Between them, an existing
 * user never receives a corrected or newly-added skill file.
 *
 * This module is the delivery path. It compares what's on disk against
 * what the package ships and reports one of four states per file, so the
 * command can write silently when there's nothing to lose and only ask
 * when the user's copy genuinely differs.
 *
 * Kept separate from `commands/skills.ts` so the decision logic is
 * testable without stubbing prompts.
 */

export type SkillFile = {
  /** Path inside the package's `skill/` directory. */
  src: string;
  /** Destination, relative to the host project root. */
  dest: string;
};

/**
 * Every skill Loupe ships. Each lives in its own `.claude/skills/<dir>`
 * so it gets its own trigger phrases — an agent shouldn't have to read to
 * the bottom of a long file to discover "prepare for production".
 */
export const LOUPE_SKILL_FILES: readonly SkillFile[] = [
  {
    src: 'SKILL.md',
    dest: path.join('.claude', 'skills', 'loupe', 'SKILL.md'),
  },
  {
    src: path.join('prepare-for-production', 'SKILL.md'),
    dest: path.join('.claude', 'skills', 'loupe-prepare-for-production', 'SKILL.md'),
  },
];

export type SkillStatus =
  /** Nothing on disk — safe to write without asking. */
  | 'create'
  /** On disk and byte-identical to what we ship — nothing to do. */
  | 'identical'
  /** On disk and different — the user may have edited it. Ask. */
  | 'differs'
  /** The package's own copy is unreadable. Never touch the destination. */
  | 'missing-source';

export type SkillPlanEntry = {
  file: SkillFile;
  status: SkillStatus;
  /** Contents shipped by the package. Absent when `missing-source`. */
  shipped?: string;
};

/** Suffix used for the pre-overwrite copy, matching `bridge.ts` and what
 *  `loupe uninstall` already knows how to restore from. */
export const BACKUP_SUFFIX = '.loupe-backup';

/**
 * Work out what would change, without changing anything.
 *
 * @param cwd       Host project root.
 * @param skillRoot The package's `skill/` directory.
 */
export async function planSkillSync(
  cwd: string,
  skillRoot: string,
): Promise<SkillPlanEntry[]> {
  const out: SkillPlanEntry[] = [];
  for (const file of LOUPE_SKILL_FILES) {
    let shipped: string;
    try {
      shipped = await fs.readFile(path.join(skillRoot, file.src), 'utf8');
    } catch {
      out.push({ file, status: 'missing-source' });
      continue;
    }
    let current: string | null = null;
    try {
      current = await fs.readFile(path.join(cwd, file.dest), 'utf8');
    } catch {
      /* not installed yet */
    }
    const status: SkillStatus =
      current === null ? 'create' : current === shipped ? 'identical' : 'differs';
    out.push({ file, status, shipped });
  }
  return out;
}

/**
 * Write one skill file, backing up first when it would clobber something
 * different. Returns the backup path when one was made.
 */
export async function writeSkillFile(
  cwd: string,
  entry: SkillPlanEntry,
): Promise<{ written: boolean; backup?: string }> {
  if (entry.status === 'missing-source' || entry.shipped === undefined) {
    return { written: false };
  }
  if (entry.status === 'identical') return { written: false };

  const dest = path.join(cwd, entry.file.dest);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  let backup: string | undefined;
  if (entry.status === 'differs') {
    backup = `${dest}${BACKUP_SUFFIX}`;
    await fs.copyFile(dest, backup);
  }
  await fs.writeFile(dest, entry.shipped, 'utf8');
  return { written: true, backup };
}
