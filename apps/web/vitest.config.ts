import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/lib/server/usecase/**/*.test.ts"],
    environment: "node",
  },
});
