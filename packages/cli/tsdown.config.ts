import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/bin.ts"],
  exports: false,
  dts: false,
  deps: {
    alwaysBundle: [/^@lionlang\/core(?:\/|$)/],
  },
  copy: [{ from: "../repl/.output", to: "dist", rename: "repl" }],
});
