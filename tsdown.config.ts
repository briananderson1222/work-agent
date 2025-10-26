import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  sourcemap: true,
  outDir: "dist",
  format: "esm",
  bundle: true,
  external: [],
});
