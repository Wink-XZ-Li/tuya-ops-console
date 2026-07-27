import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const demoMode =
    process.env.DEMO_MODE ??
    process.env.VITE_DEMO_MODE ??
    env.DEMO_MODE ??
    env.VITE_DEMO_MODE ??
    'mock';

  return {
    envDir: repoRoot,
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(demoMode),
    },
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  };
});
