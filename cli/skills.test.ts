import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  planSkillSync,
  writeSkillFile,
  LOUPE_SKILL_FILES,
  BACKUP_SUFFIX,
} from './skills.js';

/**
 * `loupe skills` exists because `init` cannot deliver a skill file to an
 * existing install: it returns early when Loupe is already in
 * package.json, and its writer prompts "exists — overwrite?" defaulting
 * to no. These tests pin the behavior that replaces it — write when
 * there's nothing to lose, ask only on a real difference, never clobber
 * without a backup.
 */

async function tmpdir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** A stand-in for the package's own `skill/` directory. */
async function fakeSkillRoot(contents: Record<string, string>): Promise<string> {
  const root = await tmpdir('loupe-skillsrc-');
  for (const [rel, body] of Object.entries(contents)) {
    const file = path.join(root, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body, 'utf8');
  }
  return root;
}

const SHIPPED = Object.fromEntries(
  LOUPE_SKILL_FILES.map((f, i) => [f.src, `shipped body ${i}\n`]),
) as Record<string, string>;

describe('planSkillSync', () => {
  let cwd: string;
  let skillRoot: string;

  beforeEach(async () => {
    cwd = await tmpdir('loupe-proj-');
    skillRoot = await fakeSkillRoot(SHIPPED);
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
    await fs.rm(skillRoot, { recursive: true, force: true });
  });

  it('reports every shipped skill as create on a fresh project', async () => {
    const plan = await planSkillSync(cwd, skillRoot);
    expect(plan).toHaveLength(LOUPE_SKILL_FILES.length);
    expect(plan.every((e) => e.status === 'create')).toBe(true);
  });

  it('ships more than one skill, each in its own directory', async () => {
    // Separate directories are what give "prepare for production" its own
    // trigger phrases instead of burying it in a long file.
    const dirs = LOUPE_SKILL_FILES.map((f) => path.dirname(f.dest));
    expect(dirs.length).toBeGreaterThan(1);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it('reports identical when the file on disk matches what we ship', async () => {
    const target = LOUPE_SKILL_FILES[0];
    const dest = path.join(cwd, target.dest);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, SHIPPED[target.src], 'utf8');

    const plan = await planSkillSync(cwd, skillRoot);
    expect(plan.find((e) => e.file.src === target.src)?.status).toBe('identical');
  });

  it('reports differs when the user has edited their copy', async () => {
    const target = LOUPE_SKILL_FILES[0];
    const dest = path.join(cwd, target.dest);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, 'my own notes\n', 'utf8');

    const plan = await planSkillSync(cwd, skillRoot);
    expect(plan.find((e) => e.file.src === target.src)?.status).toBe('differs');
  });

  it('reports missing-source rather than touching the destination', async () => {
    const empty = await tmpdir('loupe-empty-');
    const plan = await planSkillSync(cwd, empty);
    expect(plan.every((e) => e.status === 'missing-source')).toBe(true);
    expect(plan.every((e) => e.shipped === undefined)).toBe(true);
    await fs.rm(empty, { recursive: true, force: true });
  });
});

describe('writeSkillFile', () => {
  let cwd: string;
  let skillRoot: string;

  beforeEach(async () => {
    cwd = await tmpdir('loupe-proj-');
    skillRoot = await fakeSkillRoot(SHIPPED);
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
    await fs.rm(skillRoot, { recursive: true, force: true });
  });

  it('creates the file and its directories, with no backup', async () => {
    const plan = await planSkillSync(cwd, skillRoot);
    const entry = plan[0];
    const { written, backup } = await writeSkillFile(cwd, entry);

    expect(written).toBe(true);
    expect(backup).toBeUndefined();
    expect(await fs.readFile(path.join(cwd, entry.file.dest), 'utf8')).toBe(
      SHIPPED[entry.file.src],
    );
  });

  it('backs up an edited file byte-for-byte before overwriting it', async () => {
    const target = LOUPE_SKILL_FILES[0];
    const dest = path.join(cwd, target.dest);
    const mine = 'my own notes, do not lose these\n';
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, mine, 'utf8');

    const plan = await planSkillSync(cwd, skillRoot);
    const entry = plan.find((e) => e.file.src === target.src)!;
    const { written, backup } = await writeSkillFile(cwd, entry);

    expect(written).toBe(true);
    expect(backup).toBe(`${dest}${BACKUP_SUFFIX}`);
    expect(await fs.readFile(backup!, 'utf8')).toBe(mine);
    expect(await fs.readFile(dest, 'utf8')).toBe(SHIPPED[target.src]);
  });

  it('writes nothing when the copy on disk is already current', async () => {
    const target = LOUPE_SKILL_FILES[0];
    const dest = path.join(cwd, target.dest);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, SHIPPED[target.src], 'utf8');

    const plan = await planSkillSync(cwd, skillRoot);
    const entry = plan.find((e) => e.file.src === target.src)!;
    const { written, backup } = await writeSkillFile(cwd, entry);

    expect(written).toBe(false);
    expect(backup).toBeUndefined();
  });

  it('never writes when the package copy is unreadable', async () => {
    const empty = await tmpdir('loupe-empty-');
    const plan = await planSkillSync(cwd, empty);
    const { written } = await writeSkillFile(cwd, plan[0]);

    expect(written).toBe(false);
    await expect(
      fs.access(path.join(cwd, plan[0].file.dest)),
    ).rejects.toThrow();
    await fs.rm(empty, { recursive: true, force: true });
  });
});
