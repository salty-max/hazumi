import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // Every package is "type": "module", so .js is unambiguous and matches the
  // exports map. Without this tsdown emits .mjs/.d.mts.
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true,
  clean: true,
  treeshake: true,
});
