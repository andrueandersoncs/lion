import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The properties build git repositories and run whole Lion programs.
    testTimeout: 120_000,
  },
});
