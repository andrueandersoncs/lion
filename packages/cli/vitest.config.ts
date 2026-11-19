import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // A property's time depends on the machine: CI's is several times slower.
    testTimeout: 120_000,
  },
});
