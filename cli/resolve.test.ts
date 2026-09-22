import { describe, it, expect } from 'vitest';
import { resolveSource } from './resolve.js';

/**
 * `resolve` is the honesty boundary the skills lean on: literal → convertible
 * with resolved ms; anything computed → a refusal code, never a guess. These
 * tests pin the arithmetic and every refusal, because a wrong number here
 * ships a wrong animation that nobody catches.
 */

const CONFIG = `
const config = {
  id: 'demo', label: 'Demo',
  phaseOrder: ['enter', 'settle'] as const,
  phaseDurations: { enter: 600, settle: 400 },
};
`;

/** Wrap value-declaring bodies in a scene so resolveSource has a config. */
function scene(body: string): string {
  return `
    import { TimelineProvider, useTimelineValue, HOUSE_CURVE_FN, SETTLE_CURVE_FN, cubicBezier } from '@arinze-clinton/loupe';
    import { motion } from 'framer-motion';
    ${CONFIG}
    function Scene() {
      return <TimelineProvider config={config}><Inner /></TimelineProvider>;
    }
    function Inner() {
      ${body}
      return <motion.div style={{ opacity }} />;
    }
  `;
}

function only(src: string) {
  const res = resolveSource(src, 'test.tsx');
  expect(res.scenes).toHaveLength(1);
  return res.scenes[0]!;
}

describe('resolveSource — timing arithmetic', () => {
  it('resolves phase + offset + duration to an absolute window', () => {
    const s = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'settle', offset: 100, duration: 200 });`));
    const v = s.values[0]!;
    expect(v.convertible).toBe(true);
    // settle starts at 600 → 700 → 900
    expect(v.resolvedStartMs).toBe(700);
    expect(v.resolvedEndMs).toBe(900);
    expect(v.from).toBe(0);
    expect(v.to).toBe(1);
  });

  it('runs to phaseEnd when duration is omitted, NOT phaseStart+offset', () => {
    const s = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter', offset: 100 });`));
    const v = s.values[0]!;
    expect(v.resolvedStartMs).toBe(100); // enter start (0) + offset
    expect(v.resolvedEndMs).toBe(600);   // enter end, offset not re-added
  });

  it('lets endMs beat duration (follows the code, not the JSDoc)', () => {
    const s = only(scene(`const opacity = useTimelineValue(0, 1, { startMs: 100, endMs: 250, duration: 999 });`));
    const v = s.values[0]!;
    expect(v.resolvedStartMs).toBe(100);
    expect(v.resolvedEndMs).toBe(250);
  });

  it('falls back to totalDuration when no phase and no bounds', () => {
    const s = only(scene(`const opacity = useTimelineValue(0, 1, {});`));
    const v = s.values[0]!;
    expect(v.resolvedStartMs).toBe(0);
    expect(v.resolvedEndMs).toBe(1000); // 600 + 400
  });

  it('flags a zero-length window instead of inventing a fade', () => {
    // A phase present in phaseOrder with no duration entry → start === end.
    const src = `
      import { TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
      import { motion } from 'framer-motion';
      const config = { id: 'z', phaseOrder: ['a','b'] as const, phaseDurations: { b: 300 } };
      function S() { return <TimelineProvider config={config}><I/></TimelineProvider>; }
      function I() { const opacity = useTimelineValue(0,1,{ phase:'a' }); return <motion.div style={{opacity}}/>; }
    `;
    const v = only(src).values[0]!;
    expect(v.convertible).toBe(true);
    expect(v.zeroLength).toBe(true);
    expect(v.resolvedStartMs).toBe(v.resolvedEndMs);
  });

  it('refuses an inverted window (offset past the phase, no duration)', () => {
    const s = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter', offset: 800 });`));
    const v = s.values[0]!;
    // enter end is 600, start is 800 → inverted
    expect(v.convertible).toBe(false);
    expect(v.refuse).toBe('inverted-window');
  });

  it('sums phaseStart over phaseOrder and ignores keys not in it', () => {
    const src = `
      import { TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
      import { motion } from 'framer-motion';
      const config = { id: 'p', phaseOrder: ['a','b','c'] as const, phaseDurations: { a: 100, b: 200, c: 300, junk: 9999 } };
      function S() { return <TimelineProvider config={config}><I/></TimelineProvider>; }
      function I() { const opacity = useTimelineValue(0,1,{ phase:'c' }); return <motion.div style={{opacity}}/>; }
    `;
    const v = only(src).values[0]!;
    expect(v.resolvedStartMs).toBe(300); // a(100)+b(200); junk ignored
    expect(v.resolvedEndMs).toBe(600);
  });
});

describe('resolveSource — curves', () => {
  it('defaults to HOUSE_CURVE_FN control points', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter' });`)).values[0]!;
    expect(v.easeName).toBe('HOUSE_CURVE_FN');
    expect(v.ease).toEqual([0.59, 0.01, 0.4, 0.98]);
  });

  it('resolves SETTLE_CURVE_FN', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter', ease: SETTLE_CURVE_FN });`)).values[0]!;
    expect(v.ease).toEqual([0.175, 0.885, 0.32, 1.275]);
  });

  it('reads inline cubicBezier control points', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter', ease: cubicBezier(0.1, 0.2, 0.3, 0.4) });`)).values[0]!;
    expect(v.ease).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('refuses an unknown easing identifier', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter', ease: myCustomSpringLikeFn });`)).values[0]!;
    expect(v.convertible).toBe(false);
    expect(v.refuse).toBe('unknown-easing');
  });
});

describe('resolveSource — refusals (never guess)', () => {
  it('refuses a conditional from', () => {
    const v = only(scene(`const opacity = useTimelineValue(reduce ? 0 : 1, 1, { phase: 'enter' });`)).values[0]!;
    expect(v.refuse).toBe('conditional-from-to');
  });

  it('refuses a non-literal phase', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase });`)).values[0]!;
    expect(v.refuse).toBe('non-literal-phase');
  });

  it('refuses a computed option', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter', duration: base * 2 });`)).values[0]!;
    expect(v.refuse).toBe('computed-option');
  });

  it('refuses an unknown phase name', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'nope' });`)).values[0]!;
    expect(v.refuse).toBe('unknown-phase');
  });
});

describe('resolveSource — property tracing', () => {
  it('traces the driven style property (key: value form)', () => {
    const src = scene(`const rowY = useTimelineValue(10, 0, { phase: 'enter' });`).replace(
      'style={{ opacity }}',
      'style={{ y: rowY }}',
    );
    const v = only(src).values[0]!;
    expect(v.variable).toBe('rowY');
    expect(v.property).toBe('y');
  });

  it('traces the shorthand form', () => {
    const v = only(scene(`const opacity = useTimelineValue(0, 1, { phase: 'enter' });`)).values[0]!;
    expect(v.property).toBe('opacity');
  });
});

describe('resolveSource — scene discovery', () => {
  it('reads an inline config object', () => {
    const src = `
      import { TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
      import { motion } from 'framer-motion';
      function S() {
        return <TimelineProvider config={{ id: 'inline', phaseOrder: ['a'] as const, phaseDurations: { a: 500 } }}><I/></TimelineProvider>;
      }
      function I() { const opacity = useTimelineValue(0,1,{ phase:'a' }); return <motion.div style={{opacity}}/>; }
    `;
    const s = only(src);
    expect(s.id).toBe('inline');
    expect(s.totalDuration).toBe(500);
  });

  it('warns and orphans values when a file holds more than one scene', () => {
    const src = `
      import { TimelineProvider, useTimelineValue } from '@arinze-clinton/loupe';
      const a = { id: 'a', phaseOrder: ['x'] as const, phaseDurations: { x: 100 } };
      const b = { id: 'b', phaseOrder: ['y'] as const, phaseDurations: { y: 100 } };
      function A(){ return <TimelineProvider config={a}/>; }
      function B(){ return <TimelineProvider config={b}/>; }
      function I(){ const o = useTimelineValue(0,1,{phase:'x'}); return null; }
    `;
    const res = resolveSource(src, 'multi.tsx');
    expect(res.scenes).toHaveLength(0);
    expect(res.orphanValues.length).toBeGreaterThan(0);
    expect(res.warnings.join(' ')).toMatch(/2 scenes/);
  });
});

describe('resolveSource — springs', () => {
  const springScene = (body: string) => `
    import { TimelineProvider, useTimelineSpring } from '@arinze-clinton/loupe';
    import { motion } from 'framer-motion';
    const config = { id: 's', label: 'S', phaseOrder: ['enter'] as const, phaseDurations: { enter: 600 } };
    function Scene() { return <TimelineProvider config={config}><Inner /></TimelineProvider>; }
    function Inner() { ${body} return <motion.div style={{ y }} />; }
  `;
  const one = (src: string) => resolveSource(src, 'spring.tsx').scenes[0]!.values[0]!;

  it('resolves a spring with kind, window, and bounce', () => {
    const v = one(springScene(`const y = useTimelineSpring(40, 0, { phase: 'enter', bounce: 0.4 });`));
    expect(v.convertible).toBe(true);
    expect(v.kind).toBe('spring');
    expect(v.bounce).toBe(0.4);
    expect(v.resolvedStartMs).toBe(0);
    expect(v.resolvedEndMs).toBe(600);
    expect(v.ease).toBeUndefined();
  });

  it('defaults bounce to 0.2', () => {
    const v = one(springScene(`const y = useTimelineSpring(40, 0, { phase: 'enter' });`));
    expect(v.bounce).toBe(0.2);
  });

  it('refuses a computed bounce rather than guessing', () => {
    const v = one(springScene(`const y = useTimelineSpring(40, 0, { phase: 'enter', bounce: base * 2 });`));
    expect(v.convertible).toBe(false);
    expect(v.refuse).toBe('computed-option');
  });

  it('still refuses a conditional from on a spring', () => {
    const v = one(springScene(`const y = useTimelineSpring(reduce ? 40 : 0, 0, { phase: 'enter' });`));
    expect(v.refuse).toBe('conditional-from-to');
  });
});
