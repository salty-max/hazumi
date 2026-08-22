# hazumi

## 0.2.0

### Minor Changes

- a921c4c: Add image tint and source-rect crops.

  `tint()` / `noTint()` multiply images independently of fill, so distance fog
  no longer needs a second shape pass. `image()` accepts an optional source
  rectangle, and `sliceFrame()` crops a sprite without fabricating a fake frame.
  Scene factories keep the capability-import context across `await`.

### Patch Changes

- a921c4c: Stop arrow keys and space from scrolling the page while a sketch is running.
  The canvas is focusable, wheel over it is captured, and text fields keep their
  own arrows.
- Updated dependencies [a921c4c]
  - @hazumi/graphics@0.2.0
  - @hazumi/backend-webgl2@0.2.0
  - @hazumi/backend-canvas2d@0.2.0
  - @hazumi/backend-svg@0.2.0
  - @hazumi/backend-headless@0.2.0

## 0.1.1

### Patch Changes

- 21e6c3d: Point package homepage at the live site.
- Updated dependencies [21e6c3d]
  - @hazumi/audio@0.1.1
  - @hazumi/backend-canvas2d@0.1.1
  - @hazumi/backend-headless@0.1.1
  - @hazumi/backend-svg@0.1.1
  - @hazumi/backend-webgl2@0.1.1
  - @hazumi/color@0.1.1
  - @hazumi/core@0.1.1
  - @hazumi/graphics@0.1.1
  - @hazumi/math@0.1.1
  - @hazumi/physics@0.1.1

## 0.1.0

### Minor Changes

First public release: a typed command buffer, WebGL2 as the primary renderer, Canvas2D as the pixel oracle, SVG export, and a headless recorder.

`start()` runs scenes with a fixed-step clock, capability imports (`hazumi/draw`, `hazumi/input`, `hazumi/scene`, `hazumi/assets`), a 2D camera, and typed plugins. Colour is OKLCH: `fill(oklch(0.7, 0.18, 250))` or `fill(rgb(255, 40, 20))`. CSS strings still parse.

Also in 0.1.0: SDF text, images and sprites, bezier paths, shader passes, pixel access, PNG capture, Web Audio, a rigid-body host, grid A*, a debug overlay, `create-hazumi`, and an optional Vite auto-import for `*.scene.ts` files.
