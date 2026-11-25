import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/dom.ts", "src/types.ts"],
  exports: true,
  dts: true,
});
