import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import fg from 'fast-glob';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

// @babel/traverse ships as CJS with a `.default` wrapper that doesn't unwrap
// cleanly under Node's ESM loader. Reach in for it explicitly.
const traverse =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule;

/**
 * `loupe scan` — walks the project's source files and reports which
 * animations are timeline-bound vs fire-and-forget.
 *
 * Detectors implemented:
 *   - timeline-bound: imports from @arinze-clinton/loupe, useTimelineValue,
 *     <TimelineProvider>, useTransform on a time MotionValue
 *   - motion (fire-and-forget): <motion.x animate={...}>, useAnimate(),
 *     animate() function calls
 *   - WAAPI: element.animate({...})
 *   - GSAP: gsap.to / gsap.from / gsap.timeline
 *   - CSS: @keyframes blocks, transition: properties
 *
 * Output: human-readable by default; `--json` for machine-readable
 * (the Claude skill uses --json).
 */

type ScanOptions = {
  cwd: string;
  json: boolean;
};

type Finding = {
  kind: 'timeline-bound' | 'motion' | 'waapi' | 'gsap' | 'css-keyframes' | 'css-transition';
  file: string;
  line: number;
  hint: string;
};

type Report = {
  totals: Record<Finding['kind'], number>;
  files: number;
  timelineFiles: number;
  fireForgetFiles: number;
  findings: Finding[];
};

export async function scan({ cwd, json }: ScanOptions): Promise<void> {
  const files = await fg(
    [
      '**/*.{ts,tsx,js,jsx,css,scss}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
      '!**/.next/**',
      '!**/coverage/**',
    ],
    { cwd, dot: false },
  );

  const findings: Finding[] = [];
  for (const file of files) {
    const abs = path.join(cwd, file);
    const ext = path.extname(file).slice(1);
    const content = await fs.readFile(abs, 'utf8').catch(() => '');
    if (!content) continue;
    if (ext === 'css' || ext === 'scss') {
      findings.push(...detectCss(content, file));
    } else {
      findings.push(...detectJs(content, file));
    }
  }

  const totals: Report['totals'] = {
    'timeline-bound': 0,
    motion: 0,
    waapi: 0,
    gsap: 0,
    'css-keyframes': 0,
    'css-transition': 0,
  };
  for (const f of findings) totals[f.kind]++;

  const fileBuckets = new Map<string, Set<Finding['kind']>>();
  for (const f of findings) {
    let s = fileBuckets.get(f.file);
    if (!s) {
      s = new Set();
      fileBuckets.set(f.file, s);
    }
    s.add(f.kind);
  }
  let timelineFiles = 0;
  let fireForgetFiles = 0;
  for (const kinds of fileBuckets.values()) {
    if (kinds.has('timeline-bound')) timelineFiles++;
    if (
      kinds.has('motion') ||
      kinds.has('waapi') ||
      kinds.has('gsap') ||
      kinds.has('css-keyframes') ||
      kinds.has('css-transition')
    )
      fireForgetFiles++;
  }

  const report: Report = {
    totals,
    files: files.length,
    timelineFiles,
    fireForgetFiles,
    findings,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

function detectJs(src: string, file: string): Finding[] {
  const out: Finding[] = [];
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(src, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch {
    return out;
  }

  // Cheap heuristic: file imports from @arinze-clinton/loupe?
  const hasLoupeImport = /from\s+['"]@arinze-clinton\/loupe['"]/.test(src);

  traverse(ast, {
    ImportDeclaration(p) {
      const src = p.node.source.value;
      if (src === '@arinze-clinton/loupe') {
        out.push({
          kind: 'timeline-bound',
          file,
          line: p.node.loc?.start.line ?? 0,
          hint: 'imports @arinze-clinton/loupe',
        });
      }
    },
    JSXOpeningElement(p) {
      const name = p.node.name;
      if (!t.isJSXMemberExpression(name)) return;
      if (
        t.isJSXIdentifier(name.object) &&
        name.object.name === 'motion' &&
        t.isJSXIdentifier(name.property)
      ) {
        const hasAnimateProp = p.node.attributes.some(
          (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === 'animate',
        );
        if (hasAnimateProp && !hasLoupeImport) {
          out.push({
            kind: 'motion',
            file,
            line: p.node.loc?.start.line ?? 0,
            hint: `<motion.${name.property.name} animate={...}> — fire-and-forget`,
          });
        }
      }
    },
    CallExpression(p) {
      const callee = p.node.callee;
      // useAnimate(), animate()
      if (t.isIdentifier(callee) && (callee.name === 'useAnimate' || callee.name === 'animate')) {
        if (!hasLoupeImport) {
          out.push({
            kind: 'motion',
            file,
            line: p.node.loc?.start.line ?? 0,
            hint: `${callee.name}() — fire-and-forget`,
          });
        }
      }
      // gsap.to / gsap.from / gsap.timeline
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object) &&
        callee.object.name === 'gsap' &&
        t.isIdentifier(callee.property)
      ) {
        out.push({
          kind: 'gsap',
          file,
          line: p.node.loc?.start.line ?? 0,
          hint: `gsap.${callee.property.name}() — convertible to timeline`,
        });
      }
      // element.animate({...}) — WAAPI
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        callee.property.name === 'animate' &&
        !t.isThisExpression(callee.object)
      ) {
        // Skip if the object is literally the framer `animate` import (already
        // caught above). We check by ensuring it's a member access.
        out.push({
          kind: 'waapi',
          file,
          line: p.node.loc?.start.line ?? 0,
          hint: 'element.animate({...}) — WAAPI, exposes currentTime',
        });
      }
    },
  });

  return out;
}

function detectCss(src: string, file: string): Finding[] {
  const out: Finding[] = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/@keyframes\s+\w+/.test(line)) {
      out.push({
        kind: 'css-keyframes',
        file,
        line: i + 1,
        hint: '@keyframes — not scrubbable; refactor to WAAPI',
      });
    }
    // Match `transition:` declarations but not inside comments.
    if (/^\s*transition\s*:/.test(line) && !/^\s*\/\//.test(line)) {
      out.push({
        kind: 'css-transition',
        file,
        line: i + 1,
        hint: 'CSS transition — fire-and-forget',
      });
    }
  }
  return out;
}

function printHumanReport(r: Report) {
  console.log();
  console.log(kleur.bold().cyan('Loupe scan'));
  console.log(kleur.dim(`  Scanned ${r.files} file${r.files === 1 ? '' : 's'}.`));
  console.log();

  const allBound =
    r.totals.motion === 0 &&
    r.totals.waapi === 0 &&
    r.totals.gsap === 0 &&
    r.totals['css-keyframes'] === 0 &&
    r.totals['css-transition'] === 0;

  if (allBound && r.totals['timeline-bound'] > 0) {
    console.log(
      kleur.green('  ✓ Sweep complete.') +
        ' All animations are timeline-bound. ' +
        kleur.dim('No refactoring needed.'),
    );
    console.log();
    console.log(
      kleur.dim('  Open the dev server, mount <LoupePanel />, and start scrubbing.'),
    );
    console.log();
    return;
  }

  console.log(kleur.bold('  Summary'));
  row(kleur.green('timeline-bound'), r.totals['timeline-bound']);
  row(kleur.yellow('framer-motion (fire-forget)'), r.totals.motion);
  row(kleur.yellow('WAAPI (element.animate)'), r.totals.waapi);
  row(kleur.yellow('GSAP'), r.totals.gsap);
  row(kleur.red('CSS @keyframes'), r.totals['css-keyframes']);
  row(kleur.red('CSS transition'), r.totals['css-transition']);
  console.log();

  if (r.findings.length === 0) {
    console.log(kleur.dim('  No animations found.'));
    console.log();
    return;
  }

  // Show fire-and-forget findings grouped by file.
  const fireForget = r.findings.filter((f) => f.kind !== 'timeline-bound');
  if (fireForget.length === 0) return;

  const byFile = new Map<string, Finding[]>();
  for (const f of fireForget) {
    let arr = byFile.get(f.file);
    if (!arr) {
      arr = [];
      byFile.set(f.file, arr);
    }
    arr.push(f);
  }

  console.log(kleur.bold('  Refactoring candidates'));
  for (const [file, list] of byFile) {
    console.log('  ' + kleur.cyan(file));
    for (const f of list) {
      const tag =
        f.kind === 'css-keyframes' || f.kind === 'css-transition'
          ? kleur.red(f.kind)
          : kleur.yellow(f.kind);
      console.log('    ' + kleur.dim(`L${f.line}`) + '  ' + tag + '  ' + f.hint);
    }
  }
  console.log();
  console.log(
    kleur.dim('  Run ') +
      kleur.cyan('loupe scan --json') +
      kleur.dim(' for machine-readable output (the Claude skill uses this).'),
  );
  console.log();
}

function row(label: string, count: number) {
  console.log('    ' + label.padEnd(40) + kleur.bold(String(count)));
}
