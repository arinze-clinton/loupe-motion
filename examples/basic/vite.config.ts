import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve `@arinze-clinton/loupe` to the local source so every edit
// in `src/` shows up in the playground immediately — no rebuild needed.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@arinze-clinton/loupe': path.resolve(__dirname, '../../src/index.ts'),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
});
