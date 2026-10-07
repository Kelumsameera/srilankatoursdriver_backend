import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Integration suites share one in-memory MongoDB per file; run files serially to keep memory low.
    fileParallelism: false,
  },
});
