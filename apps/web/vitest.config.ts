import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/lib/server/usecase/**/*.test.ts",
      "src/lib/server/adapters/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
