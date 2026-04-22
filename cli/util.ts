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

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Detect which package manager INVOKED this CLI, from npm's
 * standard `npm_config_user_agent` environment variable (pnpm,
 * yarn, and bun all set it too). Returns null if we can't tell
 * — common when the CLI is run directly (e.g. `node dist/cli/index.js`).
 */
export function detectInvoker(): PackageManager | null {
  const ua = process.env.npm_config_user_agent ?? '';
  if (!ua) return null;
  if (ua.startsWith('pnpm/')) return 'pnpm';
  if (ua.startsWith('yarn/')) return 'yarn';
  if (ua.startsWith('bun/')) return 'bun';
  if (ua.startsWith('npm/')) return 'npm';
  return null;
}

/**
 * Framework detection for the host project. Return value powers:
 *   - the tailored `loupe.example.tsx` wiring template
 *   - which entry file path(s) the next-steps output points to
 *   - which dev-server port + start-command we suggest
 *
 * `'unknown'` means we couldn't classify — the init still runs and
 * emits a generic example with all framework branches documented
 * in comments.
 */
export type Framework =
  | 'nextjs'
  | 'vite'
  | 'remix'
  | 'astro'
  | 'cra'
  | 'unknown';

export async function detectFramework(cwd: string): Promise<Framework> {
  try {
    const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    if (deps['next']) return 'nextjs';
    if (deps['astro']) return 'astro';
    if (
      deps['@remix-run/react'] ||
      deps['@remix-run/node'] ||
      deps['@remix-run/serve']
    ) {
      return 'remix';
    }
    if (deps['vite']) return 'vite';
    if (deps['react-scripts']) return 'cra';
  } catch {
    /* fall through */
  }
  return 'unknown';
}

/**
 * Detect if a dev server is already listening on the expected port
 * for the given framework. Best-effort — never blocks longer than
 * ~200ms total so `loupe init` doesn't feel laggy.
 */
export async function detectRunningDevServer(
  framework: Framework,
): Promise<{ port: number; url: string } | null> {
  const port = defaultDevPort(framework);
  if (!port) return null;
  const listening = await isPortListening(port, 150);
  return listening ? { port, url: `http://localhost:${port}` } : null;
}

function defaultDevPort(framework: Framework): number | null {
  switch (framework) {
    case 'nextjs': return 3000;
    case 'remix': return 3000;
    case 'vite': return 5173;
    case 'astro': return 4321;
    case 'cra': return 3000;
    case 'unknown': return null;
  }
}

async function isPortListening(port: number, timeoutMs: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Open a URL in the user's default browser. Best-effort — if the
 * OS-specific command isn't available, we return false and the
 * caller prints a "open this URL" message instead.
 */
export async function openInBrowser(url: string): Promise<boolean> {
  const { spawn } = await import('node:child_process');
  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? 'open'
      : platform === 'win32'
        ? 'start'
        : 'xdg-open';
  try {
    const child = spawn(cmd, [url], {
      detached: true,
      stdio: 'ignore',
      shell: platform === 'win32', // `start` needs a shell
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * The package-manager-appropriate command for `pnpm dev` etc.
 * Most projects define a `dev` script; we just invoke it.
 */
export function devCommand(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm': return 'pnpm dev';
    case 'yarn': return 'yarn dev';
    case 'bun': return 'bun run dev';
    case 'npm':
    default: return 'npm run dev';
  }
}

/**
 * Detect which package manager the host project uses.
 * Best-effort — falls back to `npm` if nothing identifiable.
 */
export async function detectPackageManager(
  cwd: string,
): Promise<PackageManager> {
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

/**
 * Warn (non-fatal) when the CLI was invoked with the wrong
 * package-manager prefix for this project. Catches e.g. a pnpm
 * workspace being driven with `npx loupe …` — command still runs,
 * but we tell the user their PM's equivalent so future invocations
 * don't trip the "could not determine executable" resolver hole.
 */
export function warnOnInvokerMismatch(
  kleurInstance: {
    yellow: (s: string) => string;
    cyan: (s: string) => string;
    dim: (s: string) => string;
  },
  projectPm: PackageManager,
  invoker: PackageManager | null,
  cmd: string,
): void {
  if (!invoker || invoker === projectPm) return;
  const correct = loupeInvocation(projectPm, cmd, 'local');
  console.log();
  console.log(
    kleurInstance.yellow('  ! ') +
      `This looks like a ${kleurInstance.cyan(projectPm)} project ` +
      `but you invoked via ${kleurInstance.cyan(invoker)}.`,
  );
  console.log(
    kleurInstance.dim('    Prefer: ') + kleurInstance.cyan(correct),
  );
}

/**
 * Build the right way to invoke a Loupe CLI command for the
 * detected package manager, in whatever mode the caller needs:
 *
 *   mode 'local'  → assumes Loupe is installed; runs the binary
 *                    from node_modules/.bin. Fast, no network.
 *   mode 'remote' → pulls from the npm registry each time. Works
 *                    even when Loupe isn't installed in the project.
 *
 * Keeps printed instructions honest across npm/pnpm/yarn/bun — a
 * pnpm user shouldn't be told `npx loupe check` and then fail.
 */
export function loupeInvocation(
  pm: 'npm' | 'yarn' | 'pnpm' | 'bun',
  cmd: string,
  mode: 'local' | 'remote',
): string {
  if (mode === 'local') {
    switch (pm) {
      case 'pnpm':
        return `pnpm exec loupe ${cmd}`;
      case 'yarn':
        return `yarn loupe ${cmd}`;
      case 'bun':
        return `bun x loupe ${cmd}`;
      case 'npm':
      default:
        return `npx loupe ${cmd}`;
    }
  }
  // remote — fetch from the registry each run
  switch (pm) {
    case 'pnpm':
      return `pnpm dlx @arinze-clinton/loupe ${cmd}`;
    case 'yarn':
      return `yarn dlx @arinze-clinton/loupe ${cmd}`;
    case 'bun':
      return `bunx @arinze-clinton/loupe ${cmd}`;
    case 'npm':
    default:
      return `npx @arinze-clinton/loupe ${cmd}`;
  }
}

/** Build the right install command for the detected PM. */
export function installCommand(
  pm: 'npm' | 'yarn' | 'pnpm' | 'bun',
  devOnly = true,
): string {
  const flag = devOnly ? ' -D' : '';
  switch (pm) {
    case 'pnpm':
      return `pnpm add @arinze-clinton/loupe${flag}`;
    case 'yarn':
      return `yarn add @arinze-clinton/loupe${flag}`;
    case 'bun':
      return `bun add @arinze-clinton/loupe${flag}`;
    case 'npm':
    default:
      return `npm install @arinze-clinton/loupe${flag}`;
  }
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
