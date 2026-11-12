import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The tests load @lionlang/core from its source, which imports with "@/".
      "@": path.resolve(import.meta.dirname, "../core/src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
