import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared CLI helpers — reads the package's own metadata and checks
 * how Loupe is wired into a host project. Lives outside
 * `cli/commands/` so multiple commands can reuse without circular
 * imports.
 */

const PKG_NAME = '@arinze-clinton/loupe';

/**
 * The CLI's own version, read from the Loupe package.json at
 * runtime. The CLI ships inside `dist/cli/index.js`, so the
 * package root is two levels up.
 */
export const LOUPE_VERSION: string = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

/** @internal for tests */
export { PKG_NAME as LOUPE_PKG_NAME };

export type InstallInfo = {
  /** True if any of `dependencies`, `devDependencies`, or
   *  `peerDependencies` in the host's package.json declares Loupe. */
  declared: boolean;
  /** The declared semver range, if any (e.g. `"^0.2.0"`). */
  declaredRange: string | null;
  /** True if the package is physically resolved inside node_modules. */
  resolved: boolean;
  /** The actual installed version from node_modules, if resolved. */
  installedVersion: string | null;
  /** Which dependency section declared it, if any. */
  declaredIn: 'dependencies' | 'devDependencies' | 'peerDependencies' | null;
  /** The host project's package.json path — useful for error messages. */
  hostPkgPath: string;
};

/**
 * Inspect a host project to see if Loupe is installed there.
 *
 * Checks both the declaration (package.json) and the resolution
 * (node_modules/@arinze-clinton/loupe/package.json). Callers that
 * care about "is it ready to use?" should gate on `resolved`;
 * callers that care about "is it listed as a dependency?" should
 * gate on `declared`.
 */
export async function checkInstall(cwd: string): Promise<InstallInfo> {
  const hostPkgPath = path.join(cwd, 'package.json');

  let declared = false;
  let declaredRange: string | null = null;
  let declaredIn: InstallInfo['declaredIn'] = null;
  try {
    const raw = await fs.readFile(hostPkgPath, 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const bag = pkg[section];
      if (bag && typeof bag[PKG_NAME] === 'string') {
        declared = true;
        declaredRange = bag[PKG_NAME];
        declaredIn = section;
        break;
      }
    }
  } catch {
    /* No package.json, or malformed — treat as not declared. */
  }

  let resolved = false;
  let installedVersion: string | null = null;
  const installedPkgPath = path.join(
    cwd,
    'node_modules',
    '@arinze-clinton',
    'loupe',
    'package.json',
  );
  try {
    const raw = await fs.readFile(installedPkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (typeof pkg.version === 'string') {
      resolved = true;
      installedVersion = pkg.version;
    }
  } catch {
    /* Not resolved in node_modules. */
  }

  return {
    declared,
    declaredRange,
    declaredIn,
    resolved,
    installedVersion,
    hostPkgPath,
  };
}

/**
 * Fetch the latest version of Loupe from the npm registry. Best-
 * effort — returns `null` on any network / parse failure so callers
 * can render "unknown" instead of crashing.
 */
export async function fetchLatestNpmVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Detect which package manager the host project uses.
 * Best-effort — falls back to `npm` if nothing identifiable.
 */
export async function detectPackageManager(
  cwd: string,
): Promise<'npm' | 'yarn' | 'pnpm' | 'bun'> {
  const checks: Array<[string, 'npm' | 'yarn' | 'pnpm' | 'bun']> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, pm] of checks) {
    try {
      await fs.access(path.join(cwd, file));
      return pm;
    } catch {
      /* keep looking */
    }
  }
  return 'npm';
}

/** Compare two semver-ish version strings (X.Y.Z). Negative = a<b,
 *  positive = a>b, 0 = equal. Tolerates pre-release suffixes by
 *  ignoring them for the numeric compare. */
export function semverCompare(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/[^0-9.].*$/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}
