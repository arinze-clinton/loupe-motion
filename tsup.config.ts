import { defineConfig } from 'tsup';

export default defineConfig([
  // Library bundle — runtime + panel + annotations
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom', 'framer-motion'],
    treeshake: true,
  },
  // Lottie subpath — kept separate so consumers who don't need
  // lottie integration never pay for lottie-web. `lottie-web` is
  // an optional peer dep; the hook dynamic-imports it at runtime.
  {
    entry: { 'lottie/index': 'src/lottie/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    // `@arinze-clinton/loupe` is externalized so the self-import
    // of `useTimeline` inside useLoupeLottie resolves at runtime
    // to the already-loaded main bundle — sharing its
    // TimelineContext. Without this the lottie subpath would
    // bundle its own copy of the context and `useLoupeLottie()`
    // wouldn't see `<TimelineProvider>` from the main export.
    external: [
      'react',
      'react-dom',
      'framer-motion',
      'lottie-web',
      '@arinze-clinton/loupe',
    ],
    treeshake: true,
  },
  // CLI bundle — Node-only, no React
  {
    entry: { 'cli/index': 'cli/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
