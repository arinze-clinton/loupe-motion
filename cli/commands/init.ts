import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';

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
      message: 'Install the Claude skill so you can talk to Loupe in plain English?',
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

  console.log();
  console.log(kleur.bold('Next steps'));
  console.log('  1. Open ' + kleur.cyan('loupe.example.tsx') + ' and copy the wiring into your app root.');
  console.log('  2. Wrap any animated scene in ' + kleur.cyan('<TimelineProvider>') + '.');
  console.log('  3. Run ' + kleur.cyan('npx loupe scan') + ' to see which animations are timeline-bound.');
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
