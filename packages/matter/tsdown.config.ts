import { defineConfig } from 'tsdown';

const outExtensions = (): { js: string; dts: string } => ({
  js: '.js',
  dts: '.d.ts',
});

export default defineConfig([
  {
    // Per-module entry points so `import { noise } from 'matter/math'` pulls in
    // noise and nothing else.
    entry: [
      'src/index.ts',
      'src/math.ts',
      'src/color.ts',
      'src/backends/webgl2.ts',
      'src/backends/canvas2d.ts',
      'src/backends/svg.ts',
      'src/backends/headless.ts',
    ],
    format: ['esm'],
    outExtensions,
    dts: true,
    clean: true,
    treeshake: true,
  },
  {
    // Single-file IIFE build for the CDN / script-tag path.
    entry: ['src/global.ts'],
    format: ['iife'],
    globalName: 'Matter',
    outputOptions: { entryFileNames: 'matter.global.js' },
    dts: false,
    clean: false,
    minify: true,
  },
]);
