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
