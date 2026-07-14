import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: [
      "src/lib/server/usecase/**/*.test.ts",
      "src/lib/server/adapters/**/*.test.ts",
      "src/lib/server/auth/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
