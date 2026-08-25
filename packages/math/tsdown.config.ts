import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsdown";
import { documentNamespaces } from "./build/namespace-docs.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // Every package is "type": "module", so .js is unambiguous and matches the
  // exports map. Without this tsdown emits .mjs/.d.mts.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  treeshake: true,
  hooks: {
    // The d.ts bundler drops the comment on `export * as vec2`, so the seven
    // namespaces this package publishes ship with no hover documentation at
    // all. Put them back. See build/namespace-docs.ts.
    "build:done": async (): Promise<void> => {
      const source = await readFile("src/index.ts", "utf8");
      const types = await readFile("dist/index.d.ts", "utf8");
      await writeFile("dist/index.d.ts", documentNamespaces(source, types));
    },
  },
});
