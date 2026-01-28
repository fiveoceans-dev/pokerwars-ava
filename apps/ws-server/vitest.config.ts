import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/test/**/*.test.ts'],
    exclude: [
      'dist/**',
      'node_modules/**',
      'game-engine/dist/**',
      'backup/**', // Exclude broken backup tests
    ],
  },
  resolve: {
    alias: {
      '../../game-engine': path.resolve(__dirname, './game-engine/index.ts'),
      '../game-engine': path.resolve(__dirname, './game-engine'),
    },
  },
});