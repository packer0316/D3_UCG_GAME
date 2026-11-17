import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@engine': r('./src/engine'),
      '@game': r('./src/game'),
      '@net': r('./src/net'),
      '@server-fake': r('./src/server-fake'),
      '@ui': r('./src/ui'),
      '@features': r('./src/features'),
      '@app': r('./src/app'),
    },
  },
  server: { port: 5173, open: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
