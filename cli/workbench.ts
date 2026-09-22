import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * `loupe workbench` scaffolding.
 *
 * A workbench is a standalone Vite page for building/tuning an animation in
 * isolation, when the real page it'll live on is hard to work in directly.
 * You tune it here with the Loupe panel, then `prepare-for-production` hands
 * it off to the actual project.
 *
 * Deliberately framework-agnostic: it's its own tiny Vite app rather than a
 * route injected into the host (Next/CRA/Remix/…), so it works the same
 * everywhere and never has to guess the host's routing. It can still reach
 * into the project's own components via the best-effort `@/` alias; when that
 * doesn't fit a given setup, the honest fallback is to copy the component in.
 *
 * The core here is pure (templates + a plan of what to write) so it's testable
 * without touching disk; commands/workbench.ts does the writing.
 */

export const DEFAULT_WORKBENCH_DIR = 'loupe-workbench';
/** Root marker so scan / check / skills can tell workbench scenes from
 *  in-place ones (the "two Loupes in one repo" disambiguation). */
export const WORKBENCH_MARKER = path.join('.loupe', 'workbench.json');

export type WorkbenchFile = { path: string; contents: string };

/** All files a fresh workbench needs, relative to the project root. */
export function workbenchFiles(dir: string, loupeVersion: string): WorkbenchFile[] {
  const rel = (f: string) => path.join(dir, f);
  return [
    { path: rel('package.json'), contents: pkgJson() },
    { path: rel('vite.config.ts'), contents: viteConfig() },
    { path: rel('index.html'), contents: indexHtml() },
    { path: rel('main.tsx'), contents: mainTsx() },
    { path: rel('workbench-scene.tsx'), contents: sceneTsx() },
    { path: rel('README.md'), contents: readme(dir) },
    { path: WORKBENCH_MARKER, contents: marker(dir, loupeVersion) },
  ];
}

function marker(dir: string, loupeVersion: string): string {
  return JSON.stringify({ dir, loupeVersion, created: new Date().toISOString() }, null, 2) + '\n';
}

function pkgJson(): string {
  return JSON.stringify(
    {
      name: 'loupe-workbench',
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: {
        '@arinze-clinton/loupe': '*',
        'framer-motion': '>=11',
        react: '>=18',
        'react-dom': '>=18',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.3.0',
        typescript: '^5.3.0',
        vite: '^5.4.0',
      },
    },
    null,
    2,
  ) + '\n';
}

function viteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Best-effort: let you import your project's own components with '@/...'.
// If your project uses a different alias, or this points at the wrong place,
// change it — or just copy the component you're tuning into this folder.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(here, '..', 'src') },
  },
  server: { port: 5199 },
});
`;
}

function indexHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Loupe workbench</title>
    <style>
      body { margin: 0; background: #0d0f13; color: #e8eaee;
        font-family: system-ui, -apple-system, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`;
}

function mainTsx(): string {
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LoupeRegistryProvider, AnnotationsProvider, LoupePanel } from '@arinze-clinton/loupe';
import { WorkbenchScene } from './workbench-scene';

// The workbench: your scene, plus the Loupe panel to scrub and tune it.
// Build your animation in workbench-scene.tsx. When it feels right, ask your
// agent to "prepare this for production" and it'll hand off to your project.
//
// Provider order matters: LoupeRegistryProvider (the clock + scene registry)
// wraps AnnotationsProvider (feedback, read by the panel), which wraps both
// your scenes and the panel. The panel needs both above it.
function App() {
  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <WorkbenchScene />
        </div>
        <LoupePanel />
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

function sceneTsx(): string {
  return `import { SceneRoot, TimelineProvider, useTimelineValue, SETTLE_CURVE_FN } from '@arinze-clinton/loupe';
import { motion } from 'framer-motion';

// A starter scene. Rename phases, add values, drop in your own visuals —
// then scrub it with the panel. Every value is a function of the shared
// clock, so it pauses and rewinds like a video.
const config = {
  id: 'workbench:demo',
  label: 'Workbench demo',
  phaseOrder: ['enter', 'settle'] as const,
  phaseDurations: { enter: 500, settle: 400 },
};

export function WorkbenchScene() {
  return (
    <TimelineProvider config={config}>
      <Card />
    </TimelineProvider>
  );
}

function Card() {
  const opacity = useTimelineValue(0, 1, { phase: 'enter', duration: 400 });
  const y = useTimelineValue(24, 0, { phase: 'enter', duration: 500, ease: SETTLE_CURVE_FN });
  const scale = useTimelineValue(0.96, 1, { phase: 'settle', duration: 400, ease: SETTLE_CURVE_FN });

  return (
    <SceneRoot
      style={{
        width: 280,
        padding: 28,
        borderRadius: 16,
        background: '#151922',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px -30px rgba(0,0,0,0.6)',
      }}
    >
      <motion.div style={{ opacity, y, scale }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Your animation</div>
        <div style={{ fontSize: 13, color: '#9BA3AF', marginTop: 6 }}>
          Edit workbench-scene.tsx and scrub it with the panel below.
        </div>
      </motion.div>
    </SceneRoot>
  );
}
`;
}

function readme(dir: string): string {
  return `# Loupe workbench

A standalone page for building and tuning an animation in isolation.

## Run it

\`\`\`bash
cd ${dir}
npm install
npm run dev
\`\`\`

Then open the printed URL. You'll see the starter scene and the Loupe panel.

## The flow

1. Build your animation in \`workbench-scene.tsx\` — one \`<TimelineProvider>\`,
   values via \`useTimelineValue\`. Scrub and pause with the panel.
2. To use a real component from your project, import it with \`@/...\`
   (aliased to \`../src\` — adjust in \`vite.config.ts\` if your project differs),
   or copy it into this folder.
3. When it feels right, ask your agent: **"prepare this workbench scene for
   production"**. It converts to plain animation code and drops it into your
   project where you say.

This folder is a build surface, not shipped code. Regenerate the production
version and replace, rather than editing the output by hand.
`;
}
