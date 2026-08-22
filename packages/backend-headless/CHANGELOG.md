# @hazumi/backend-headless

## 0.2.0

### Minor Changes

- 8cce1f1: First public release: a typed command buffer, WebGL2 as the primary renderer, Canvas2D as the pixel oracle, SVG export, and a headless recorder.

  `start()` runs scenes with a fixed-step clock, capability imports (`hazumi/draw`, `hazumi/input`, `hazumi/scene`, `hazumi/assets`), a 2D camera, and typed plugins. Colour is OKLCH: `fill(oklch(0.7, 0.18, 250))` or `fill(rgb(255, 40, 20))`. CSS strings still parse.

  Also in 0.1.0: SDF text, images and sprites, bezier paths, shader passes, pixel access, PNG capture, Web Audio, a rigid-body host, grid A\*, a debug overlay, `create-hazumi`, and an optional Vite auto-import for `*.scene.ts` files.

### Patch Changes

- Updated dependencies [8cce1f1]
  - @hazumi/color@0.2.0
  - @hazumi/core@0.2.0
  - @hazumi/graphics@0.2.0
  - @hazumi/math@0.2.0
