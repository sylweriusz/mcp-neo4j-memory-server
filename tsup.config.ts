/// <reference types="node" />
import { defineConfig } from "tsup";

export default defineConfig({
  format: "esm",
  outExtension: () => ({
    js: ".mjs",
  }),
  entry: ["src/index.ts"],
  clean: true,
  sourcemap: false,
  dts: false,
  minify: true,
});
