import { parse } from '@babel/parser';
import traverseModule, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';

// @babel/traverse ships CJS with a `.default` wrapper that doesn't unwrap
// cleanly under Node's ESM loader (same dance as scan.ts).
const traverse =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule;

/**
 * `loupe resolve` core — turn a timeline-bound scene into the FACTS an agent
 * needs to convert it, so the agent never does the arithmetic itself.
 *
 * The guiding rule: the static-analysis boundary IS the honesty boundary.
 * If every input to `useTimelineValue` reads as a literal, the value is
 * `convertible` and carries resolved absolute-ms timing. If anything is a
 * conditional, a variable, or a computed expression, the value is flagged
 * `convertible: false` with a machine-readable `refuse` code — the same
 * refusals the prepare-for-production skill lists, produced mechanically
 * instead of recognised by eye.
 *
 * Springs (`useTimelineSpring`) don't exist yet; when they land, a spring
 * branch and the settle-past-end computation live here too.
 */

/** The two named curves Loupe ships, plus the default. From phases.ts. */
const NAMED_CURVES: Record<string, [number, number, number, number]> = {
  HOUSE_CURVE_FN: [0.59, 0.01, 0.4, 0.98],
  SETTLE_CURVE_FN: [0.175, 0.885, 0.32, 1.275],
};
const DEFAULT_CURVE_NAME = 'HOUSE_CURVE_FN';

export type RefuseCode =
  | 'conditional-from-to'
  | 'computed-value'
  | 'non-literal-phase'
  | 'unknown-phase'
  | 'computed-option'
  | 'unknown-easing'
  | 'inverted-window'
  | 'scene-config-not-found';

export type ResolvedValue = {
  file: string;
  line: number;
  /** Nearest enclosing function component name, best-effort. */
  component?: string;
  /** The variable the call is assigned to, if any (a strong property hint). */
  variable?: string;
  /** The style property this value drives, when it could be traced. */
  property?: string;

  /** Which hook produced this — an eased value or a spring. */
  kind: 'value' | 'spring';

  from?: number;
  to?: number;
  phase?: string;
  offset?: number;
  duration?: number;
  startMs?: number;
  endMs?: number;

  /** Eased values only: resolved easing control points, when known. */
  ease?: [number, number, number, number];
  easeName?: string;
  /** Springs only: overshoot (0 clean, higher wobbles). Defaults to 0.2. */
  bounce?: number;

  /** Absolute window on the scene clock, in ms. Present when convertible. */
  resolvedStartMs?: number;
  resolvedEndMs?: number;
  /** true when start === end (emit duration:0, don't let Framer invent a fade). */
  zeroLength?: boolean;

  convertible: boolean;
  refuse?: RefuseCode;
  reason?: string;
};

export type ResolvedScene = {
  id: string;
  label?: string;
  file: string;
  phaseOrder: string[];
  phases: { phase: string; start: number; end: number; duration: number }[];
  totalDuration: number;
  values: ResolvedValue[];
};

export type ResolveResult = {
  scenes: ResolvedScene[];
  /** useTimelineValue calls whose scene config wasn't found in the same file. */
  orphanValues: ResolvedValue[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Literal readers — each returns `undefined` when the node isn't a plain literal.
// ---------------------------------------------------------------------------

function numberLiteral(node: t.Node | null | undefined): number | undefined {
  if (t.isNumericLiteral(node)) return node.value;
  // Negative numbers parse as UnaryExpression(-, NumericLiteral).
  if (t.isUnaryExpression(node) && node.operator === '-' && t.isNumericLiteral(node.argument)) {
    return -node.argument.value;
  }
  return undefined;
}

function stringLiteral(node: t.Node | null | undefined): string | undefined {
  if (t.isStringLiteral(node)) return node.value;
  return undefined;
}

/** Unwrap `x as const` / `x as T` / `<T>x` to the inner expression. */
function unwrapAs(node: t.Node): t.Node {
  let cur = node;
  while (t.isTSAsExpression(cur) || t.isTSTypeAssertion(cur)) cur = cur.expression;
  return cur;
}

// ---------------------------------------------------------------------------
// Scene config
// ---------------------------------------------------------------------------

type SceneConfig = {
  id: string;
  label?: string;
  phaseOrder: string[];
  phaseDurations: Record<string, number>;
};

function readSceneConfig(obj: t.ObjectExpression): SceneConfig | null {
  let id: string | undefined;
  let label: string | undefined;
  let phaseOrder: string[] | undefined;
  let phaseDurations: Record<string, number> | undefined;

  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : undefined;
    if (!key) continue;
    const val = unwrapAs(prop.value as t.Node);

    if (key === 'id') id = stringLiteral(val);
    else if (key === 'label') label = stringLiteral(val);
    else if (key === 'phaseOrder' && t.isArrayExpression(val)) {
      const arr: string[] = [];
      for (const el of val.elements) {
        const s = stringLiteral(el);
        if (s === undefined) return null; // non-literal phase name — can't trust the order
        arr.push(s);
      }
      phaseOrder = arr;
    } else if (key === 'phaseDurations' && t.isObjectExpression(val)) {
      const map: Record<string, number> = {};
      for (const dp of val.properties) {
        if (!t.isObjectProperty(dp)) return null;
        const k = t.isIdentifier(dp.key)
          ? dp.key.name
          : t.isStringLiteral(dp.key)
            ? dp.key.value
            : undefined;
        const n = numberLiteral(dp.value as t.Node);
        if (k === undefined || n === undefined) return null;
        map[k] = n;
      }
      phaseDurations = map;
    }
  }

  if (!id || !phaseOrder || !phaseDurations) return null;
  return { id, label, phaseOrder, phaseDurations };
}

/** computeRanges, mirrored from src/runtime/phases.ts. */
function computeRanges(config: SceneConfig) {
  const out: { phase: string; start: number; end: number; duration: number }[] = [];
  let cursor = 0;
  for (const phase of config.phaseOrder) {
    const duration = config.phaseDurations[phase] ?? 0;
    out.push({ phase, start: cursor, end: cursor + duration, duration });
    cursor += duration;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

function readEase(
  node: t.Node | undefined,
): { ease: [number, number, number, number]; name?: string } | 'unknown' | 'default' {
  if (!node) return 'default';
  if (t.isIdentifier(node)) {
    const pts = NAMED_CURVES[node.name];
    if (pts) return { ease: pts, name: node.name };
    return 'unknown';
  }
  if (t.isCallExpression(node) && t.isIdentifier(node.callee) && node.callee.name === 'cubicBezier') {
    const nums = node.arguments.map((a) => numberLiteral(a));
    if (nums.length === 4 && nums.every((n) => n !== undefined)) {
      return { ease: nums as [number, number, number, number] };
    }
    return 'unknown';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Component + property tracing
// ---------------------------------------------------------------------------

function enclosingComponent(path: NodePath): string | undefined {
  let fn = path.getFunctionParent();
  while (fn) {
    const node = fn.node;
    if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
    if (
      (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) &&
      t.isVariableDeclarator(fn.parent) &&
      t.isIdentifier(fn.parent.id)
    ) {
      return fn.parent.id.name;
    }
    fn = fn.getFunctionParent();
  }
  return undefined;
}

/**
 * Given the `const X = useTimelineValue(...)` declarator, trace X to the
 * style property it drives — `style={{ opacity: X }}` → "opacity", or the
 * shorthand `style={{ X }}` → "X". Uses scope bindings so it never confuses
 * a same-named variable in another component.
 */
function traceProperty(callPath: NodePath<t.CallExpression>): string | undefined {
  const declarator = callPath.parentPath;
  if (!declarator?.isVariableDeclarator()) return undefined;
  const id = declarator.node.id;
  if (!t.isIdentifier(id)) return undefined;

  const binding = callPath.scope.getBinding(id.name);
  if (!binding) return undefined;

  for (const ref of binding.referencePaths) {
    // `{ opacity: X }` — X is the value of an object property.
    const prop = ref.parentPath;
    if (prop?.isObjectProperty() && prop.node.value === ref.node) {
      if (!isInsideStyleAttr(prop)) continue;
      const key = prop.node.key;
      if (t.isIdentifier(key)) return key.name;
      if (t.isStringLiteral(key)) return key.value;
    }
    // `{ X }` shorthand — the property key and value are the same node.
    if (prop?.isObjectProperty() && prop.node.shorthand && isInsideStyleAttr(prop)) {
      return id.name;
    }
  }
  return undefined;
}

function isInsideStyleAttr(path: NodePath): boolean {
  const objExpr = path.findParent((p) => p.isObjectExpression());
  if (!objExpr) return false;
  const attr = objExpr.parentPath;
  // style={{ ... }} → JSXExpressionContainer whose parent is JSXAttribute name=style
  if (attr?.isJSXExpressionContainer()) {
    const jsxAttr = attr.parentPath;
    if (
      jsxAttr?.isJSXAttribute() &&
      t.isJSXIdentifier(jsxAttr.node.name) &&
      jsxAttr.node.name.name === 'style'
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Value extraction
// ---------------------------------------------------------------------------

function refusal(base: Omit<ResolvedValue, 'convertible'>, code: RefuseCode, reason: string): ResolvedValue {
  return { ...base, convertible: false, refuse: code, reason };
}

function extractValue(
  callPath: NodePath<t.CallExpression>,
  file: string,
  ranges: { phase: string; start: number; end: number; duration: number }[] | null,
  totalDuration: number | null,
  hookKind: 'value' | 'spring',
): ResolvedValue {
  const node = callPath.node;
  const line = node.loc?.start.line ?? 0;
  const base: Omit<ResolvedValue, 'convertible'> = {
    file,
    line,
    kind: hookKind,
    component: enclosingComponent(callPath),
    variable: t.isVariableDeclarator(callPath.parent) && t.isIdentifier(callPath.parent.id)
      ? callPath.parent.id.name
      : undefined,
    property: traceProperty(callPath),
  };

  const [fromArg, toArg, optsArg] = node.arguments;

  // from / to
  const from = numberLiteral(fromArg);
  const to = numberLiteral(toArg);
  if (from === undefined || to === undefined) {
    const which = from === undefined ? 'from' : 'to';
    const bad = from === undefined ? fromArg : toArg;
    if (t.isConditionalExpression(bad)) {
      return refusal(base, 'conditional-from-to', `\`${which}\` is a conditional — keep the conditional, don't inline one branch`);
    }
    return refusal(base, 'computed-value', `\`${which}\` isn't a literal number — resolve it by hand`);
  }
  base.from = from;
  base.to = to;

  // options
  let phase: string | undefined;
  let offset: number | undefined;
  let duration: number | undefined;
  let startMs: number | undefined;
  let endMs: number | undefined;

  if (optsArg && t.isObjectExpression(optsArg)) {
    for (const prop of optsArg.properties) {
      if (!t.isObjectProperty(prop)) continue;
      const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : undefined;
      const v = prop.value as t.Node;
      if (key === 'phase') {
        const s = stringLiteral(v);
        if (s === undefined) return refusal(base, 'non-literal-phase', '`phase` isn\'t a string literal — resolve each rendered instance separately');
        phase = s;
      } else if (key === 'ease' && hookKind === 'value') {
        const e = readEase(v);
        if (e === 'unknown') return refusal(base, 'unknown-easing', '`ease` isn\'t a known curve — keep the import or sample it into stops');
        if (e !== 'default') { base.ease = e.ease; base.easeName = e.name; }
      } else if (key === 'bounce' && hookKind === 'spring') {
        const n = numberLiteral(v);
        if (n === undefined) return refusal(base, 'computed-option', '`bounce` isn\'t a literal number — resolve it by hand');
        base.bounce = n;
      } else if (key === 'offset' || key === 'duration' || key === 'startMs' || key === 'endMs') {
        const n = numberLiteral(v);
        if (n === undefined) return refusal(base, 'computed-option', `\`${key}\` isn't a literal number — resolve it by hand`);
        if (key === 'offset') offset = n;
        else if (key === 'duration') duration = n;
        else if (key === 'startMs') startMs = n;
        else endMs = n;
      }
    }
  }
  base.phase = phase;
  base.offset = offset;
  base.duration = duration;
  base.startMs = startMs;
  base.endMs = endMs;

  // State the default explicitly so the agent always emits one.
  if (hookKind === 'spring') {
    if (base.bounce === undefined) base.bounce = 0.2;
  } else if (!base.ease) {
    base.ease = NAMED_CURVES[DEFAULT_CURVE_NAME];
    base.easeName = DEFAULT_CURVE_NAME;
  }

  // Timing — needs the scene's phase ranges.
  if (!ranges || totalDuration === null) {
    return refusal(base, 'scene-config-not-found', 'the scene config for this value wasn\'t found in the same file — run resolve where the <TimelineProvider> lives, or pass the config');
  }

  let start: number;
  let end: number;
  if (phase !== undefined) {
    const r = ranges.find((x) => x.phase === phase);
    if (!r) return refusal(base, 'unknown-phase', `phase "${phase}" isn't in this scene's phaseOrder`);
    start = r.start + (offset ?? 0);
    end = duration !== undefined ? start + duration : r.end;
  } else {
    start = startMs ?? 0;
    end = endMs ?? (duration !== undefined ? start + duration : totalDuration);
  }

  if (start > end) {
    return refusal(base, 'inverted-window', `window is inverted (${start} > ${end}) — the value plays backwards; check offset vs duration`);
  }

  return {
    ...base,
    convertible: true,
    resolvedStartMs: start,
    resolvedEndMs: end,
    zeroLength: start === end,
  };
}

// ---------------------------------------------------------------------------
// Per-source resolution
// ---------------------------------------------------------------------------

export function resolveSource(src: string, file: string): ResolveResult {
  const warnings: string[] = [];
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(src, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch {
    return { scenes: [], orphanValues: [], warnings: [`${file}: failed to parse`] };
  }

  // Pass 1 — collect scene configs. Support `config={config}` (a same-file
  // const) and `config={{ ...inline }}`.
  const topLevelObjects = new Map<string, t.ObjectExpression>();
  const configs: SceneConfig[] = [];

  traverse(ast, {
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && p.node.init) {
        const init = unwrapAs(p.node.init);
        if (t.isObjectExpression(init)) topLevelObjects.set(p.node.id.name, init);
      }
    },
  });

  traverse(ast, {
    JSXOpeningElement(p) {
      const name = p.node.name;
      if (!t.isJSXIdentifier(name) || name.name !== 'TimelineProvider') return;
      const attr = p.node.attributes.find(
        (a): a is t.JSXAttribute =>
          t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === 'config',
      );
      if (!attr || !t.isJSXExpressionContainer(attr.value)) return;
      const expr = attr.value.expression;
      let obj: t.ObjectExpression | undefined;
      if (t.isObjectExpression(expr)) obj = expr;
      else if (t.isIdentifier(expr)) obj = topLevelObjects.get(expr.name);
      if (!obj) return;
      const cfg = readSceneConfig(obj);
      if (cfg) configs.push(cfg);
      else warnings.push(`${file}: found <TimelineProvider> but couldn't read its config statically`);
    },
  });

  // Decide the single scene this file's values belong to.
  let scene: SceneConfig | null = null;
  if (configs.length === 1) scene = configs[0]!;
  else if (configs.length > 1) {
    warnings.push(
      `${file}: ${configs.length} scenes in one file — resolve can't associate values to the right one; split them or resolve per-scene.`,
    );
  }

  const ranges = scene ? computeRanges(scene) : null;
  const totalDuration = ranges ? (ranges.length ? ranges[ranges.length - 1]!.end : 0) : null;

  // Pass 2 — every useTimelineValue call.
  const values: ResolvedValue[] = [];
  traverse(ast, {
    CallExpression(p) {
      if (!t.isIdentifier(p.node.callee)) return;
      const name = p.node.callee.name;
      if (name === 'useTimelineValue') values.push(extractValue(p, file, ranges, totalDuration, 'value'));
      else if (name === 'useTimelineSpring') values.push(extractValue(p, file, ranges, totalDuration, 'spring'));
    },
  });

  if (scene && ranges) {
    return {
      scenes: [
        {
          id: scene.id,
          label: scene.label,
          file,
          phaseOrder: scene.phaseOrder,
          phases: ranges,
          totalDuration: totalDuration!,
          values,
        },
      ],
      orphanValues: [],
      warnings,
    };
  }
  return { scenes: [], orphanValues: values, warnings };
}
