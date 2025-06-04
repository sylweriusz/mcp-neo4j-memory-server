/// <reference types="node" />
import { defineConfig } from "tsup";

export default defineConfig({
  format: "esm",
  outExtension: () => ({
    js: ".mjs",
  }),
  entry: ["src/index.ts", "src/http/server.ts"],
  clean: true,
  sourcemap: false,
  dts: false,
  minify: true,
  // Bundle extracted stopwords into the final build
  external: ["neo4j-driver", "@modelcontextprotocol/sdk", "@xenova/transformers", "express"],
  bundle: true,
  // Ensure dependencies are bundled correctly
  platform: "node",
});
