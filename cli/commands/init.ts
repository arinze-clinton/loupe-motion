import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  checkInstall,
  detectFramework,
  detectInvoker,
  detectPackageManager,
  detectRunningDevServer,
  devCommand,
  loupeInvocation,
  openInBrowser,
  warnOnInvokerMismatch,
  type Framework,
} from '../util.js';
import {
  autoWireNextjs,
  upgradeDemoSceneIfGenerated,
  type AutoWireResult,
} from '../auto-wire.js';
import {
  bridgeLocalTimelineProvider,
  findLocalTimelineProviders,
  type BridgeOutcome,
} from '../bridge.js';

// tsup ships this file as ESM; `__dirname` isn't defined there.
// Recompute from `import.meta.url` so the skill-file lookup works.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `loupe init` — sets up Loupe in a host project.
 *
 *   1. Asks the user how they want Loupe to mount (auto vs manual).
 *   2. Writes the Claude skill into .claude/skills/loupe/SKILL.md.
 *   3. Drops a sample wiring file at loupe.example.tsx so the user can
 *      copy/paste into their app root.
 *
 * Non-destructive — never overwrites existing files without confirmation.
 */

type InitOptions = {
  cwd: string;
};

export async function init({ cwd }: InitOptions): Promise<void> {
  console.log();
  console.log(kleur.bold().cyan('Loupe ✦ ') + 'timeline-first motion authoring');
  console.log(kleur.dim('Setting up Loupe in this project.\n'));

  // Bail early if Loupe is already installed — running `loupe init`
  // twice should tell the user what's already there rather than
  // silently re-prompt and risk overwriting custom wiring.
  const existing = await checkInstall(cwd);
  const pm = await detectPackageManager(cwd);
  warnOnInvokerMismatch(kleur, pm, detectInvoker(), 'init');
  if (existing.resolved || existing.declared) {
    const installed = existing.installedVersion ?? kleur.dim('not resolved');
    const declared = existing.declaredRange ?? kleur.dim('not declared');
    console.log(
      kleur.yellow('  Loupe is already installed in this project.'),
    );
    console.log(`    Installed: ${kleur.bold(installed)}`);
    console.log(
      `    Declared:  ${kleur.bold(String(declared))}` +
        (existing.declaredIn
          ? kleur.dim(`  (${existing.declaredIn})`)
          : ''),
    );
    console.log();
    console.log(
      `  Run ${kleur.cyan(loupeInvocation(pm, 'check', 'local'))} ` +
        'anytime to see your version and check for updates.',
    );
    console.log(
      `  Run ${kleur.cyan(loupeInvocation(pm, 'uninstall', 'local'))} ` +
        'to remove Loupe cleanly.',
    );
    console.log();

    // Still offer to (re)write the sample wiring / skill for users
    // who want to regenerate them — but only after explicit confirm.
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Re-run the init prompts anyway (regenerate wiring + skill)?',
      initial: false,
    });
    if (!proceed) return;
    console.log();
  }

  // Detect framework up-front so we can offer auto-wire only when
  // we know how to do it safely for the detected stack.
  const framework = await detectFramework(cwd);
  const canAutoWire = framework === 'nextjs';

  const answers = await prompts([
    {
      type: 'select',
      name: 'mount',
      message: 'How should Loupe mount into your app?',
      choices: [
        {
          title: 'Auto — show in dev, hide in prod (recommended)',
          description: 'Loupe wraps your app and reveals itself only in development.',
          value: 'auto',
        },
        {
          title: 'Manual — I will mount <LoupePanel /> myself',
          description: 'You decide where and when to render Loupe.',
          value: 'manual',
        },
      ],
      initial: 0,
    },
    canAutoWire
      ? {
        type: 'confirm',
        name: 'autoWire',
        message:
          'Auto-wire Loupe into app/layout.tsx for you? (recommended — creates loupe-provider.tsx + backs up the original)',
        initial: true,
      }
      : { type: null as unknown as 'confirm', name: 'autoWire' }, // skip the prompt
    {
      type: 'confirm',
      name: 'installSkill',
      message:
        'Install the Claude skill so you can talk to Loupe in plain English? (recommended)',
      initial: true,
    },
  ]);

  if (!answers.mount) {
    console.log(kleur.yellow('\nCancelled.'));
    return;
  }

  // 1. Sample wiring file — framework-aware so the example matches
  //    the imports / entry-file shape of the user's stack.
  //    (Framework was detected above, before the prompts.)
  const sampleFile = path.join(cwd, 'loupe.example.tsx');
  await writeIfMissing(sampleFile, sampleWiring(answers.mount, framework));
  console.log(kleur.green('  ✓ ') + path.relative(cwd, sampleFile));

  // 2. Claude skill — opt-in.
  if (answers.installSkill) {
    const skillDir = path.join(cwd, '.claude', 'skills', 'loupe');
    await fs.mkdir(skillDir, { recursive: true });
    const skillSrc = path.resolve(__dirname, '..', '..', 'skill', 'SKILL.md');
    const skillDest = path.join(skillDir, 'SKILL.md');
    try {
      const skillContent = await fs.readFile(skillSrc, 'utf8');
      await writeIfMissing(skillDest, skillContent);
      console.log(kleur.green('  ✓ ') + path.relative(cwd, skillDest));
    } catch {
      console.log(
        kleur.yellow('  ! ') +
          'Skill source not found at ' +
          path.relative(cwd, skillSrc) +
          ' — skipped.',
      );
    }
  }

  // 3. Auto-wire the entry file when the user opted in (Next.js only
  //    for now). Any non-success path falls through to the paste-it-
  //    yourself flow below.
  let wire: AutoWireResult | null = null;
  if (answers.autoWire && canAutoWire) {
    try {
      wire = await autoWireNextjs(cwd);
      if (wire) {
        console.log(kleur.green('  ✓ ') + wire.providerFile);
        console.log(kleur.green('  ✓ ') + wire.demoFile + kleur.dim('  (demo scene — delete when done)'));
        console.log(kleur.green('  ✓ ') + `${wire.entryFile} (backup → ${wire.backupFile})`);
      } else {
        console.log(
          kleur.yellow('  ! ') +
            "Couldn't auto-wire — your layout file doesn't match the expected shape. See Next steps below.",
        );
      }
    } catch (err) {
      console.log(
        kleur.yellow('  ! ') +
          'Auto-wire failed: ' +
          (err instanceof Error ? err.message : String(err)) +
          '. Falling back to manual. See Next steps below.',
      );
    }
  }

  // 3b. Silently bridge any local TimelineProvider copies so their
  //     scenes show up in the Loupe panel's dropdown. No prompt —
  //     user-facing UX just says "your existing scenes are now
  //     visible". Uninstall reverts via the `.loupe-backup` the
  //     patcher writes.
  try {
    const candidates = await findLocalTimelineProviders(cwd);
    for (const abs of candidates) {
      const outcome: BridgeOutcome = await bridgeLocalTimelineProvider(abs);
      const rel = path.relative(cwd, abs);
      if (outcome.kind === 'patched') {
        console.log(
          kleur.green('  ✓ ') +
            rel +
            kleur.dim(`  (bridged → scenes will appear in Loupe's dropdown)`),
        );
      } else if (outcome.kind === 'already-bridged') {
        // Quiet — nothing to report.
      } else if (outcome.kind === 'unsupported-shape') {
        console.log(
          kleur.yellow('  ! ') +
            rel +
            kleur.dim(`  (skipped bridge: ${outcome.reason})`),
        );
      }
    }
  } catch (err) {
    console.log(
      kleur.yellow('  ! ') +
        'Bridge scan failed: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  // 3c. Silently upgrade a pre-existing loupe-demo-scene.tsx so it
  //     uses the latest template (v0.2.15: hides the dot unless
  //     Demo is actively selected). User-edited files are detected
  //     by the absence of our generation marker and left alone.
  try {
    const upgraded = await upgradeDemoSceneIfGenerated(cwd);
    for (const rel of upgraded) {
      console.log(
        kleur.green('  ✓ ') +
          rel +
          kleur.dim('  (demo scene upgraded to latest template)'),
      );
    }
  } catch {
    /* best-effort — a bad demo-scene upgrade isn't worth blocking init */
  }

  const invocation = (cmd: string) => loupeInvocation(pm, cmd, 'local');
  const entryFile = entryFileFor(framework);
  const running = await detectRunningDevServer(framework);

  console.log();
  console.log(kleur.bold('Next steps'));
  console.log();

  if (wire) {
    // AUTO-WIRED PATH — no next-steps, no good-to-know, no extra
    // links. Install should feel "done" the moment prompts finish.
    console.log();
    if (running) {
      const opened = await openInBrowser(running.url);
      console.log(
        kleur.bold().green('✓ All set. ') +
          'Refresh ' +
          kleur.cyan(running.url) +
          ' — the Loupe timeline panel appears at the bottom.',
      );
      if (opened) {
        console.log(kleur.dim('  (Opened it in your browser for you.)'));
      }
    } else {
      console.log(
        kleur.bold().green('✓ All set. ') +
          'Start your dev server (' +
          kleur.cyan(devCommand(pm)) +
          ') and the Loupe timeline panel appears at the bottom of the page.',
      );
    }
    console.log();
    return;
  }

  // MANUAL PATH — user declined auto-wire, wasn't offered, or it bailed.
  console.log(
    '  ' +
      kleur.bold('1.') +
      ' Open ' +
      kleur.cyan('loupe.example.tsx') +
      ' (just created in this folder).',
  );
  console.log(
    '     It has the exact code to paste into your app, ready to go.',
  );
  console.log();
  if (entryFile) {
    console.log(
      '  ' +
        kleur.bold('2.') +
        ' Paste that code into ' +
        kleur.cyan(entryFile.path) +
        '.',
    );
    if (entryFile.note) {
      console.log(`     ${kleur.dim(entryFile.note)}`);
    }
  } else {
    console.log(
      '  ' +
        kleur.bold('2.') +
        ' Paste the code into your app\'s top-level entry file.',
    );
    console.log(
      kleur.dim('       • Next.js:') + '  app/layout.tsx (or src/app/layout.tsx)',
    );
    console.log(kleur.dim('       • Vite:   ') + '  src/main.tsx or src/App.tsx');
    console.log(kleur.dim('       • Remix:  ') + '  app/root.tsx');
    console.log(kleur.dim('       • Astro:  ') + '  src/layouts/*.astro + a React island');
  }
  console.log();
  console.log(
    '  ' +
      kleur.bold('3.') +
      ' Pick ONE animation to start. Wrap it in ' +
      kleur.cyan('<TimelineProvider>') +
      '.',
  );
  console.log(
    '     The example shows syntax. Expand to more scenes later.',
  );
  console.log();
  if (running) {
    console.log(
      '  ' +
        kleur.bold('4.') +
        ' Your dev server is already running at ' +
        kleur.cyan(running.url) +
        '.',
    );
    console.log(
      '     Save the files above → the page refreshes → look for the floating ' +
        kleur.cyan('Loupe') +
        ' panel in the corner.',
    );
  } else {
    console.log(
      '  ' +
        kleur.bold('4.') +
        ' Start your dev server with ' +
        kleur.cyan(devCommand(pm)) +
        ',',
    );
    console.log(
      '     then open the URL it prints. The floating ' +
        kleur.cyan('Loupe') +
        ' panel will appear in the corner.',
    );
  }
  console.log();
  printGoodToKnow(invocation);
}

function printGoodToKnow(invocation: (cmd: string) => string): void {
  console.log(kleur.dim('Good to know'));
  console.log(
    kleur.dim('  • ') +
      kleur.cyan(invocation('check')) +
      kleur.dim('     see your installed version + check for updates'),
  );
  console.log(
    kleur.dim('  • ') +
      kleur.cyan(invocation('scan')) +
      kleur.dim('      list animations that are timeline-bound'),
  );
  console.log(
    kleur.dim('  • ') +
      kleur.cyan(invocation('uninstall')) +
      kleur.dim(' remove Loupe cleanly from this project'),
  );
  console.log();
}

/**
 * The most likely entry-file path for a given framework. Returned
 * as a single string so next-steps output reads crisp ("Paste into
 * app/layout.tsx"). `null` when we don't know the framework and
 * should show the generic bulleted list instead.
 */
function entryFileFor(
  framework: Framework,
): { path: string; note?: string } | null {
  switch (framework) {
    case 'nextjs':
      return {
        path: 'app/layout.tsx',
        note:
          'If you use the Pages Router, paste into pages/_app.tsx instead.',
      };
    case 'vite':
      return {
        path: 'src/main.tsx',
        note: 'Wrap the root <App /> before calling createRoot(...).render(...).',
      };
    case 'remix':
      return {
        path: 'app/root.tsx',
        note: 'Put the wiring inside the <body> in the default export.',
      };
    case 'astro':
      return {
        path: 'src/layouts/Layout.astro',
        note:
          'Render a React island and mount Loupe inside it (Astro pages are .astro, Loupe is React).',
      };
    case 'cra':
      return {
        path: 'src/index.tsx',
        note: 'Wrap your <App /> before passing it to ReactDOM.render(...).',
      };
    case 'unknown':
      return null;
  }
}

async function writeIfMissing(file: string, content: string): Promise<void> {
  try {
    await fs.access(file);
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `${path.basename(file)} exists — overwrite?`,
      initial: false,
    });
    if (!overwrite) return;
  } catch {
    /* file doesn't exist — proceed */
  }
  await fs.writeFile(file, content, 'utf8');
}

function sampleWiring(mount: 'auto' | 'manual', framework: Framework): string {
  switch (framework) {
    case 'nextjs':
      return nextjsSample(mount);
    case 'remix':
      return remixSample(mount);
    case 'astro':
      return astroSample(mount);
    case 'vite':
    case 'cra':
    case 'unknown':
    default:
      return viteSample(mount);
  }
}

function viteSample(mount: 'auto' | 'manual'): string {
  if (mount === 'auto') {
    return `// Loupe — paste this into src/main.tsx (or your app root).
// Works with Vite + React (import.meta.env.DEV check is Vite-specific).

import {
  LoupeRegistryProvider,
  LoupePanel,
  AnnotationsProvider,
  AnnotationOverlay,
  AnnotationPins,
} from '@arinze-clinton/loupe';

const isDev = import.meta.env?.DEV;

export function withLoupe(children: React.ReactNode) {
  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        {children}
        {isDev && (
          <>
            <LoupePanel />
            <AnnotationOverlay />
            <AnnotationPins />
          </>
        )}
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}

// In your root render (src/main.tsx typically looks like this):
//   ReactDOM.createRoot(document.getElementById('root')!).render(
//     withLoupe(<App />)
//   );
`;
  }
  return `// Loupe — manual-mount sample wiring (Vite + React).

import {
  LoupeRegistryProvider,
  LoupePanel,
  AnnotationsProvider,
  AnnotationOverlay,
  AnnotationPins,
} from '@arinze-clinton/loupe';

export function App() {
  const showLoupe = import.meta.env?.DEV;

  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        <YourApp />
        {showLoupe && (
          <>
            <LoupePanel />
            <AnnotationOverlay />
            <AnnotationPins />
          </>
        )}
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}
`;
}

function nextjsSample(mount: 'auto' | 'manual'): string {
  return `'use client';

// Loupe — paste this into app/layout.tsx (App Router) OR
// use it from pages/_app.tsx (Pages Router).
//
// Loupe is a client component — the 'use client' directive above
// is required when you place it in a Next.js layout.

import {
  LoupeRegistryProvider,
  LoupePanel,
  AnnotationsProvider,
  AnnotationOverlay,
  AnnotationPins,
} from '@arinze-clinton/loupe';

const isDev = process.env.NODE_ENV !== 'production';

export function WithLoupe({ children }: { children: React.ReactNode }) {
  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        {children}
        {isDev && (
          <>
            <LoupePanel />
            <AnnotationOverlay />
            <AnnotationPins />
          </>
        )}
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}

// ── App Router (app/layout.tsx) ────────────────────────────────
// Wrap your children with <WithLoupe>:
//
//   export default function RootLayout({ children }) {
//     return (
//       <html lang="en">
//         <body>
//           <WithLoupe>{children}</WithLoupe>
//         </body>
//       </html>
//     );
//   }
//
// ── Pages Router (pages/_app.tsx) ──────────────────────────────
// Wrap the <Component />:
//
//   export default function App({ Component, pageProps }) {
//     return (
//       <WithLoupe>
//         <Component {...pageProps} />
//       </WithLoupe>
//     );
//   }
${mount === 'auto' ? '' : '\n// Manual mode: gate `isDev` on whatever signal you want\n// (feature flag, hotkey, query param).\n'}`;
}

function remixSample(mount: 'auto' | 'manual'): string {
  return `// Loupe — paste this into app/root.tsx.
// Remix root already exports a default component wrapping your
// document; add WithLoupe INSIDE the <body>.

import {
  LoupeRegistryProvider,
  LoupePanel,
  AnnotationsProvider,
  AnnotationOverlay,
  AnnotationPins,
} from '@arinze-clinton/loupe';

const isDev = process.env.NODE_ENV !== 'production';

export function WithLoupe({ children }: { children: React.ReactNode }) {
  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        {children}
        {isDev && (
          <>
            <LoupePanel />
            <AnnotationOverlay />
            <AnnotationPins />
          </>
        )}
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}

// Usage in app/root.tsx:
//
//   export default function App() {
//     return (
//       <html>
//         <head><Meta /><Links /></head>
//         <body>
//           <WithLoupe>
//             <Outlet />
//           </WithLoupe>
//           <Scripts />
//         </body>
//       </html>
//     );
//   }
${mount === 'auto' ? '' : '\n// Manual mode: replace `isDev` with your own gate.\n'}`;
}

function astroSample(mount: 'auto' | 'manual'): string {
  // Astro surfaces Loupe via a React island, not the .astro file.
  return viteSample(mount).replace(
    '// Works with Vite + React',
    '// For Astro: place this in a .tsx component loaded as a React island (client:load).',
  );
}
