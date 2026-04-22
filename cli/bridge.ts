import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Auto-bridge local TimelineProvider implementations to Loupe's registry.
 *
 * Some projects ship a local copy of the Loupe timeline primitives
 * (under `src/lib/baylee-timeline.tsx` etc. — often copied from the
 * catalog before Loupe was npm-packaged). These local providers use
 * a different React context than Loupe's panel, so scenes built on
 * them don't show up in the scene-picker dropdown.
 *
 * This patcher detects those files at `loupe init` time and adds
 * exactly two things so the local provider registers with Loupe:
 *
 *   1. `import { useRegisterSceneWithLoupe } from '@arinze-clinton/loupe';`
 *   2. Two lines inside the TimelineProvider function body (a
 *      sceneRootRef + a call to `useRegisterSceneWithLoupe(...)`
 *      mapping the local state to Loupe's `ExternalScene` shape),
 *      plus a `<div ref={sceneRootRef}>` wrap around `{children}`
 *      in the return JSX.
 *
 * We back up the original before editing so `loupe uninstall` can
 * restore it byte-for-byte — same backup convention as the layout
 * auto-wire (`<file>.loupe-backup`).
 *
 * Supports the catalog-shaped template:
 *   `export function TimelineProvider({config, externalTimeMs, children})`
 *   `const value = useMemo<TimelineState>(...)`
 *   `return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;`
 *
 * Bails cleanly when the file shape differs — returns
 * `'unsupported-shape'` so init can fall back to a friendly note.
 */

export type BridgeResult = {
  file: string;
  backupFile: string;
};

export type BridgeOutcome =
  | { kind: 'patched'; result: BridgeResult }
  | { kind: 'already-bridged'; file: string }
  | { kind: 'unsupported-shape'; file: string; reason: string };

/** Paths to scan for local TimelineProviders. Relative to cwd. */
const CANDIDATE_GLOBS = [
  'src/lib/baylee-timeline.tsx',
  'src/lib/baylee-timeline.ts',
  'app/lib/baylee-timeline.tsx',
  'lib/baylee-timeline.tsx',
  'src/lib/timeline.tsx',
  'src/timeline.tsx',
];

/**
 * Look for files whose path matches a known catalog location AND
 * whose contents look like a local TimelineProvider.
 * Returns a list of candidate absolute paths.
 */
export async function findLocalTimelineProviders(cwd: string): Promise<string[]> {
  const found: string[] = [];
  for (const rel of CANDIDATE_GLOBS) {
    const abs = path.join(cwd, rel);
    try {
      await fs.access(abs);
    } catch {
      continue;
    }
    // Only consider it if the file actually exports TimelineProvider.
    const src = await fs.readFile(abs, 'utf8');
    if (!/export\s+function\s+TimelineProvider/.test(src)) continue;
    found.push(abs);
  }
  return found;
}

/**
 * Apply the bridge patch to a single local TimelineProvider file.
 * Returns an outcome so callers can print per-file status.
 */
export async function bridgeLocalTimelineProvider(
  absFile: string,
): Promise<BridgeOutcome> {
  const original = await fs.readFile(absFile, 'utf8');

  if (
    original.includes('@arinze-clinton/loupe') ||
    original.includes('useRegisterSceneWithLoupe')
  ) {
    return { kind: 'already-bridged', file: absFile };
  }

  // Identify the TimelineProvider function body's return line so we
  // can splice in the bridge hook call + wrap children with a ref
  // div. The catalog template uses this exact return shape:
  const returnRegex =
    /return\s+<TimelineContext\.Provider\s+value=\{value\}>\{children\}<\/TimelineContext\.Provider>;/;
  if (!returnRegex.test(original)) {
    return {
      kind: 'unsupported-shape',
      file: absFile,
      reason:
        'TimelineProvider return does not match the expected `<TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>` shape.',
    };
  }

  // Find the useMemo(value) block so we inject the hook call right
  // AFTER it — we want `ranges`, `totalDuration`, `time`, etc. (the
  // closed-over locals) to be in scope, which they are at the end
  // of the useMemo declaration.
  const useMemoRegex = /const\s+value\s*=\s*useMemo<TimelineState>[\s\S]+?\);\n/;
  const useMemoMatch = original.match(useMemoRegex);
  if (!useMemoMatch) {
    return {
      kind: 'unsupported-shape',
      file: absFile,
      reason:
        "Couldn't find the `const value = useMemo<TimelineState>(...)` block — likely a divergent local timeline shape.",
    };
  }

  // Insert import after the last `import … from …;` statement.
  const importLine =
    "import { useRegisterSceneWithLoupe } from '@arinze-clinton/loupe';";
  const withImport = insertAfterLastImport(original, importLine);

  // Inject the bridge hook right after the useMemo block.
  const bridgeInjection = `
  // Bridge this scene into the Loupe panel's registry (added by
  // \`loupe init\` — restored to original by \`loupe uninstall\`).
  const sceneRootRef = useRef<HTMLDivElement | null>(null);
  useRegisterSceneWithLoupe(
    {
      id: config.id,
      label: config.label,
      phaseOrder: config.phaseOrder,
      phaseLabels: config.phaseLabels,
      ranges,
      totalDuration,
      time,
      speed,
      setSpeed,
      paused,
      setPaused,
      seek,
      restart,
    },
    sceneRootRef,
  );
`;

  const injectedUseMemoEnd = withImport.indexOf(useMemoMatch[0]) + useMemoMatch[0].length;
  const withBridge =
    withImport.slice(0, injectedUseMemoEnd) +
    bridgeInjection +
    withImport.slice(injectedUseMemoEnd);

  // Wrap the children in a div with the ref so Loupe can flash /
  // scroll to the scene.
  const withWrap = withBridge.replace(
    returnRegex,
    'return <TimelineContext.Provider value={value}><div ref={sceneRootRef}>{children}</div></TimelineContext.Provider>;',
  );

  // Back up and write.
  const backupPath = `${absFile}.loupe-backup`;
  await fs.writeFile(backupPath, original, 'utf8');
  await fs.writeFile(absFile, withWrap, 'utf8');

  return {
    kind: 'patched',
    result: { file: absFile, backupFile: backupPath },
  };
}

function insertAfterLastImport(source: string, line: string): string {
  const importRegex = /^import\s[^\n]*;$/gm;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) {
    last = m;
  }
  if (!last) return `${line}\n\n${source}`;
  const end = last.index + last[0].length;
  return `${source.slice(0, end)}\n${line}${source.slice(end)}`;
}

/** Locate any `<file>.loupe-backup` files under cwd that look like
 *  bridge backups (sibling of a TimelineProvider-like file). Used by
 *  uninstall to revert. */
export async function findBridgeReverts(cwd: string): Promise<
  Array<{ file: string; backupFile: string }>
> {
  const results: Array<{ file: string; backupFile: string }> = [];
  for (const rel of CANDIDATE_GLOBS) {
    const abs = path.join(cwd, rel);
    const backup = `${abs}.loupe-backup`;
    try {
      await fs.access(backup);
      results.push({ file: abs, backupFile: backup });
    } catch {
      /* no backup, no revert */
    }
  }
  return results;
}
