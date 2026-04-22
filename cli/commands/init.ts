import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  checkInstall,
  detectInvoker,
  detectPackageManager,
  loupeInvocation,
  warnOnInvokerMismatch,
} from '../util.js';

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

  // 1. Sample wiring file — always written, gives the user a copy-paste reference.
  const sampleFile = path.join(cwd, 'loupe.example.tsx');
  await writeIfMissing(sampleFile, sampleWiring(answers.mount));
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

  const invocation = (cmd: string) => loupeInvocation(pm, cmd, 'local');

  console.log();
  console.log(kleur.bold('Next steps'));
  console.log();
  console.log(
    '  ' +
      kleur.bold('1.') +
      ' Open the file ' +
      kleur.cyan('loupe.example.tsx') +
      ' (just created in this folder).',
  );
  console.log('     It has a commented block showing exactly how to mount Loupe.');
  console.log();
  console.log(
    '  ' +
      kleur.bold('2.') +
      ' Find your app\'s top-level entry file. Typically one of:',
  );
  console.log(
    kleur.dim('       • Next.js:') + '  app/layout.tsx (or src/app/layout.tsx)',
  );
  console.log(kleur.dim('       • Vite:   ') + '  src/main.tsx or src/App.tsx');
  console.log(kleur.dim('       • Remix:  ') + '  app/root.tsx');
  console.log(
    '     Paste the wiring from ' +
      kleur.cyan('loupe.example.tsx') +
      ' into that file,',
  );
  console.log('     following the comments for where to put each piece.');
  console.log();
  console.log(
    '  ' +
      kleur.bold('3.') +
      ' For each animation you want to review, wrap it in',
  );
  console.log(
    '     ' + kleur.cyan('<TimelineProvider config={…}>') + '. The example',
  );
  console.log("     shows how. Don't worry about all animations at once —");
  console.log('     start with one scene and expand from there.');
  console.log();
  console.log(
    '  ' +
      kleur.bold('4.') +
      ' Start your dev server and look for the floating ' +
      kleur.cyan('Loupe') +
      ' panel.',
  );
  console.log('     Click any scene in the dropdown → scrub, pause, annotate.');
  console.log();
  console.log(
    kleur.dim('  Need the full walkthrough? ') +
      kleur.cyan('https://github.com/arinze-clinton/loupe-motion'),
  );
  console.log();
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

function sampleWiring(mount: 'auto' | 'manual'): string {
  if (mount === 'auto') {
    return `// Loupe — auto-mount sample wiring.
// Copy this into your app root (e.g. main.tsx or App.tsx).

import {
  LoupeRegistryProvider,
  LoupePanel,
  AnnotationsProvider,
  AnnotationOverlay,
  AnnotationPins,
} from '@arinze-clinton/loupe';

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== 'production';

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

// Then in your root render:
//   ReactDOM.createRoot(document.getElementById('root')!).render(withLoupe(<App />));
`;
  }
  return `// Loupe — manual-mount sample wiring.
// Copy what you need into your app root.

import {
  LoupeRegistryProvider,
  LoupePanel,
  AnnotationsProvider,
  AnnotationOverlay,
  AnnotationPins,
} from '@arinze-clinton/loupe';

// You decide when Loupe shows up. Examples:
//   - dev only:        const showLoupe = import.meta.env.DEV;
//   - feature flag:    const showLoupe = window.location.search.includes('loupe=1');
//   - keybind toggle:  manage a useState('loupeOpen', false) and bind a hotkey.

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
