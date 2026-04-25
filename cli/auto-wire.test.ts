import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  upgradeDemoSceneIfGenerated,
  LOUPE_DEMO_GENERATED_MARKER,
} from './auto-wire.js';

async function tmpdir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'loupe-test-'));
}

describe('upgradeDemoSceneIfGenerated', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await tmpdir();
    await fs.mkdir(path.join(cwd, 'app'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('leaves a generated v2 file alone when already on latest template', async () => {
    const file = path.join(cwd, 'app/loupe-demo-scene.tsx');
    const latest = `// ${LOUPE_DEMO_GENERATED_MARKER}\nuseOptionalLoupeRegistry\n`;
    await fs.writeFile(file, latest, 'utf8');

    const upgraded = await upgradeDemoSceneIfGenerated(cwd);

    expect(upgraded).toEqual([]);
    expect(await fs.readFile(file, 'utf8')).toBe(latest);
  });

  it('leaves user-edited files alone (no marker)', async () => {
    const file = path.join(cwd, 'app/loupe-demo-scene.tsx');
    const userContent = '// my custom demo scene\nexport const x = 1;\n';
    await fs.writeFile(file, userContent, 'utf8');

    const upgraded = await upgradeDemoSceneIfGenerated(cwd);

    expect(upgraded).toEqual([]);
    expect(await fs.readFile(file, 'utf8')).toBe(userContent);
  });

  it('upgrades a v0.2.8+ template (matches by prose fingerprint)', async () => {
    const file = path.join(cwd, 'app/loupe-demo-scene.tsx');
    const old = '// Loupe demo scene — shows Loupe is working on first install\n';
    await fs.writeFile(file, old, 'utf8');

    const upgraded = await upgradeDemoSceneIfGenerated(cwd);

    expect(upgraded).toEqual(['app/loupe-demo-scene.tsx']);
    const after = await fs.readFile(file, 'utf8');
    expect(after).toContain(LOUPE_DEMO_GENERATED_MARKER);
  });

  it('does NOT write a backup by default', async () => {
    const file = path.join(cwd, 'app/loupe-demo-scene.tsx');
    const old = '// Loupe demo scene — shows Loupe is working on first install\n';
    await fs.writeFile(file, old, 'utf8');

    await upgradeDemoSceneIfGenerated(cwd);

    await expect(fs.access(`${file}.loupe-backup`)).rejects.toBeTruthy();
  });

  it('writes a .loupe-backup when opts.backup is true', async () => {
    const file = path.join(cwd, 'app/loupe-demo-scene.tsx');
    const old = '// Loupe demo scene — shows Loupe is working on first install\nconst before = 1;\n';
    await fs.writeFile(file, old, 'utf8');

    const upgraded = await upgradeDemoSceneIfGenerated(cwd, { backup: true });

    expect(upgraded).toEqual(['app/loupe-demo-scene.tsx']);
    const backup = await fs.readFile(`${file}.loupe-backup`, 'utf8');
    expect(backup).toBe(old);
    const after = await fs.readFile(file, 'utf8');
    expect(after).toContain(LOUPE_DEMO_GENERATED_MARKER);
  });
});
