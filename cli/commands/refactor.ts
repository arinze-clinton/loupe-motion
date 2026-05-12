import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import kleur from 'kleur';
import fg from 'fast-glob';
import prompts from 'prompts';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

const traverse =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule;

/**
 * `loupe refactor` — interactive walk-through that shows how to make
 * each fire-and-forget animation in the project scrubbable by Loupe.
 *
 * v1 scope: Framer Motion `<motion.x animate={...}>` only. Everything
 * else (WAAPI, GSAP, CSS) is intentionally deferred — covering those
 * before this v1 sees real codebases would be premature.
 *
 * Mode: show-and-paste. Nothing is written to disk. The user copies
 * the suggested replacement and pastes it themselves. This matches
 * the skill's promise — "nothing gets refactored without your
 * sign-off" — and avoids the AST-rewrite reliability risk of
 * automated edits across the many shapes of motion props.
 */

type Refactorable = {
  file: string;
  line: number;
  beforeText: string;
  afterText: string;
  sceneHint: string;
};

type RefactorOptions = {
  cwd: string;
};

export async function refactor({ cwd }: RefactorOptions): Promise<void> {
  console.log();
  console.log(
    kleur.bold().cyan('Loupe ✦ ') + 'refactor walk-through',
  );
  console.log(
    kleur.dim(
      'Show-and-paste mode — nothing gets written to disk.\n',
    ),
  );

  const items = await collectRefactorables(cwd);

  if (items.length === 0) {
    console.log(
      kleur.green('  ✓ No fire-and-forget Framer Motion animations found.'),
    );
    console.log(
      kleur.dim(
        '    Either everything is timeline-bound already, or you have' +
          '\n    no Framer Motion animations in this project yet.\n',
      ),
    );
    return;
  }

  console.log(
    kleur.bold(
      `  Found ${items.length} fire-and-forget Framer Motion animation${
        items.length === 1 ? '' : 's'
      } across ${countFiles(items)} file${
        countFiles(items) === 1 ? '' : 's'
      }.`,
    ),
  );
  console.log(
    kleur.dim(
      "  Walking through them one at a time. You decide what to do with each.\n",
    ),
  );

  console.log(kleur.dim('  First time refactoring with Loupe?'));
  console.log(
    kleur.dim(
      '  ‣ Wrap your app in <LoupeRegistryProvider> at the root.' +
        '\n  ‣ Mount <LoupePanel /> alongside it.' +
        '\n  ‣ Wrap each animated scene in <TimelineProvider config={...}>.' +
        '\n  See: npx loupe init\n',
    ),
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(
      kleur.dim('──────────────────────────────────────────────────────'),
    );
    console.log(
      kleur.bold(`${i + 1} of ${items.length}`) +
        kleur.dim(' · ') +
        kleur.cyan(path.relative(cwd, item.file) + ':' + item.line),
    );
    console.log();
    console.log(kleur.yellow('  BEFORE'));
    console.log(indent(item.beforeText, 4));
    console.log();
    console.log(kleur.green('  AFTER'));
    console.log(indent(item.afterText, 4));
    if (item.sceneHint) {
      console.log();
      console.log(kleur.dim('  Scene config hint:'));
      console.log(indent(item.sceneHint, 4));
    }
    console.log();

    const action = await promptAction();
    if (action === 'quit') {
      console.log(kleur.dim('\n  Stopped. Run again any time.\n'));
      return;
    }
    if (action === 'copy') {
      const ok = await copyToClipboard(item.afterText);
      if (ok) {
        console.log(
          kleur.green('  ✓ Copied AFTER snippet to clipboard.\n'),
        );
      } else {
        console.log(
          kleur.yellow(
            '  Clipboard not available on this platform — select the AFTER text above and copy manually.\n',
          ),
        );
      }
    }
    // 'next' and 'skip' both just advance.
  }

  console.log(kleur.dim('──────────────────────────────────────────────────────'));
  console.log(kleur.green('  ✓ Walk-through complete.\n'));
}

async function promptAction(): Promise<'next' | 'skip' | 'copy' | 'quit'> {
  const res = await prompts({
    type: 'select',
    name: 'a',
    message: 'What now?',
    choices: [
      { title: 'Next — show the next animation', value: 'next' },
      { title: 'Copy AFTER snippet to clipboard', value: 'copy' },
      { title: 'Skip this one', value: 'skip' },
      { title: 'Quit', value: 'quit' },
    ],
    initial: 0,
  });
  return (res.a as 'next' | 'skip' | 'copy' | 'quit') ?? 'quit';
}

async function copyToClipboard(text: string): Promise<boolean> {
  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? 'pbcopy'
      : platform === 'win32'
      ? 'clip'
      : 'xclip';
  const args = platform === 'linux' ? ['-selection', 'clipboard'] : [];
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
      child.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}

function countFiles(items: Refactorable[]): number {
  return new Set(items.map((i) => i.file)).size;
}

function indent(text: string, n: number): string {
  const pad = ' '.repeat(n);
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}

async function collectRefactorables(cwd: string): Promise<Refactorable[]> {
  const files = await fg(
    [
      '**/*.{tsx,jsx}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
      '!**/.next/**',
      '!**/coverage/**',
    ],
    { cwd, absolute: true },
  );

  const out: Refactorable[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }

    // Skip files that already import Loupe — they've opted in.
    if (/from\s+['"]@arinze-clinton\/loupe['"]/.test(src)) continue;
    // Cheap pre-filter so we don't parse files with no motion at all.
    if (!/<motion\./.test(src)) continue;

    let ast;
    try {
      ast = parse(src, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      });
    } catch {
      continue;
    }

    traverse(ast, {
      JSXOpeningElement(p) {
        const name = p.node.name;
        if (
          !t.isJSXMemberExpression(name) ||
          !t.isJSXIdentifier(name.object) ||
          name.object.name !== 'motion' ||
          !t.isJSXIdentifier(name.property)
        )
          return;

        const animateAttr = p.node.attributes.find(
          (a) =>
            t.isJSXAttribute(a) &&
            t.isJSXIdentifier(a.name) &&
            a.name.name === 'animate',
        ) as t.JSXAttribute | undefined;
        if (!animateAttr) return;

        const initialAttr = p.node.attributes.find(
          (a) =>
            t.isJSXAttribute(a) &&
            t.isJSXIdentifier(a.name) &&
            a.name.name === 'initial',
        ) as t.JSXAttribute | undefined;
        const transitionAttr = p.node.attributes.find(
          (a) =>
            t.isJSXAttribute(a) &&
            t.isJSXIdentifier(a.name) &&
            a.name.name === 'transition',
        ) as t.JSXAttribute | undefined;

        const recipe = buildRecipe({
          tagName: name.property.name,
          animate: animateAttr,
          initial: initialAttr,
          transition: transitionAttr,
        });
        if (!recipe) return;

        // Slice the actual source for the BEFORE text. Use the
        // JSX opening element's range — that's enough to ground
        // the user without dragging in the whole element body.
        const start = p.node.start ?? 0;
        const end = p.node.end ?? start;
        const beforeText = src.slice(start, end).trim();

        out.push({
          file,
          line: p.node.loc?.start.line ?? 0,
          beforeText,
          afterText: recipe.afterText,
          sceneHint: recipe.sceneHint,
        });
      },
    });
  }

  return out;
}

type Recipe = {
  afterText: string;
  sceneHint: string;
};

function buildRecipe(input: {
  tagName: string;
  animate: t.JSXAttribute;
  initial?: t.JSXAttribute;
  transition?: t.JSXAttribute;
}): Recipe | null {
  const animateProps = readObjectExpression(input.animate);
  if (!animateProps) return null;
  const initialProps = input.initial ? readObjectExpression(input.initial) : {};
  const transitionProps = input.transition
    ? readObjectExpression(input.transition)
    : {};

  const durationSec =
    typeof transitionProps?.duration === 'number' ? transitionProps.duration : 0.5;
  const delaySec =
    typeof transitionProps?.delay === 'number' ? transitionProps.delay : 0;
  const durationMs = Math.round(durationSec * 1000);
  const offsetMs = Math.round(delaySec * 1000);
  const phaseDuration = offsetMs + durationMs;

  const properties = Object.keys(animateProps);
  if (properties.length === 0) return null;

  const lines: string[] = [];
  for (const key of properties) {
    const to = animateProps[key];
    const from = initialProps && key in initialProps ? initialProps[key] : 0;
    const opts: string[] = [`phase: 'enter'`];
    if (offsetMs > 0) opts.push(`offset: ${offsetMs}`);
    opts.push(`duration: ${durationMs}`);
    lines.push(
      `const ${key} = useTimelineValue(${JSON.stringify(from)}, ${JSON.stringify(
        to,
      )}, { ${opts.join(', ')} });`,
    );
  }

  const styleParts = properties.join(', ');
  lines.push('');
  lines.push(`return <motion.${input.tagName} style={{ ${styleParts} }} />;`);

  const sceneHint =
    `phaseOrder: ['enter']\n` +
    `phaseDurations: { enter: ${phaseDuration} }  // ${
      offsetMs > 0 ? `${offsetMs}ms delay + ` : ''
    }${durationMs}ms duration`;

  return {
    afterText: lines.join('\n'),
    sceneHint,
  };
}

/**
 * Read a JSX expression attribute as a plain JS object — values
 * limited to numbers, strings, and booleans. Anything more complex
 * (variables, expressions, computed keys) returns `null` to signal
 * "we can't safely rewrite this one."
 */
function readObjectExpression(
  attr: t.JSXAttribute,
): Record<string, number | string | boolean> | null {
  if (!attr.value || !t.isJSXExpressionContainer(attr.value)) return null;
  const expr = attr.value.expression;
  if (!t.isObjectExpression(expr)) return null;
  const out: Record<string, number | string | boolean> = {};
  for (const prop of expr.properties) {
    if (!t.isObjectProperty(prop)) return null;
    if (prop.computed) return null;
    let key: string;
    if (t.isIdentifier(prop.key)) key = prop.key.name;
    else if (t.isStringLiteral(prop.key)) key = prop.key.value;
    else return null;
    const v = prop.value;
    if (t.isNumericLiteral(v)) out[key] = v.value;
    else if (t.isStringLiteral(v)) out[key] = v.value;
    else if (t.isBooleanLiteral(v)) out[key] = v.value;
    else if (
      t.isUnaryExpression(v) &&
      v.operator === '-' &&
      t.isNumericLiteral(v.argument)
    )
      out[key] = -v.argument.value;
    else return null;
  }
  return out;
}
