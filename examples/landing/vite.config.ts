import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Subpath adapters must come BEFORE the bare specifier so the
    // more-specific entries win. Each adapter self-imports
    // `@arinze-clinton/loupe`, which the bare alias points back at
    // the same `src/index.ts` — so they all share one TimelineContext.
    alias: [
      {
        find: '@arinze-clinton/loupe/gsap',
        replacement: path.resolve(__dirname, '../../src/gsap/index.ts'),
      },
      {
        find: '@arinze-clinton/loupe/waapi',
        replacement: path.resolve(__dirname, '../../src/waapi/index.ts'),
      },
      {
        find: '@arinze-clinton/loupe/lottie',
        replacement: path.resolve(__dirname, '../../src/lottie/index.ts'),
      },
      {
        find: '@arinze-clinton/loupe',
        replacement: path.resolve(__dirname, '../../src/index.ts'),
      },
    ],
  },
  server: {
    port: 5175,
    open: true,
  },
});
