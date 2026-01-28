import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // @ts-ignore
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ['**/*.test.tsx', '**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'server/**',
    ],
  },
  resolve: {
    alias: {
      "~~": path.resolve(__dirname, "./"),
      "../game-engine": path.resolve(__dirname, "./game-engine.ts"),
      "../../game-engine": path.resolve(__dirname, "./game-engine.ts"),
    },
  },
});
