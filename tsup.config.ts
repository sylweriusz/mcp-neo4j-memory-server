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
  // Bundle stopwords-iso into the final build
  external: ["neo4j-driver", "@modelcontextprotocol/sdk", "@xenova/transformers"],
  bundle: true,
  // Ensure dependencies are bundled correctly
  platform: "node",
});
