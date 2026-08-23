# @hazumi/backend-webgl2

## 0.6.0

### Patch Changes

- 53835db: Put the arrow keys in the text atlas.

  The default charset covered ASCII and the Latin-1 supplement, so a scene
  naming its controls — the most ordinary thing a game draws — rendered
  `→ throttle` as `¿ throttle`. Four glyphs, and the most common control legend
  there is now reads.

- Updated dependencies [9d6f068]
  - @hazumi/math@0.6.0
  - @hazumi/color@0.6.0
  - @hazumi/graphics@0.6.0
  - @hazumi/core@0.6.0

## 0.5.0

### Minor Changes

- 510ae40: Measure text, and wrap it.

  `measureText`, `textWidth` and `wrapText` in `hazumi/draw`. Until now the API
  could draw a string but not ask how wide it was, which left no way to fit a
  label to a button, centre a caption, or lay out a dialogue box — the kind of
  thing every game needs and no scene could compute for itself.

  Measurement belongs to the backend, because only the backend knows the font, so
  `Renderer` gains an optional `measureText` returning the new `TextMetrics`
  (`width`, `ascent`, `descent`, `lineHeight`). The GPU path sums advances from
  the same SDF atlas it draws with, so the number a scene lays out against is the
  number that gets drawn; Canvas2D and SVG ask a canvas. All three take `ascent`
  and `descent` from a fixed "Hg" sample so they describe the line box rather than
  whichever glyphs are in this particular string — and so they agree with each
  other. Measured at 20px, WebGL2 and Canvas2D both report 45.6px for "Hello" and
  break the same sentence at the same word.

  `wrapText` splits on spaces, preserves newlines you wrote, and gives a word
  wider than the box its own line rather than cutting it.

  A backend with no font context cannot answer, and says so:
  `TextMeasurementUnavailableError` rather than a guessed width that would
  silently misplace every layout built on it.

### Patch Changes

- 241c4b4: Draw text correctly where the rasteriser reports no derivative.

  The glyph shader softened its edge with `smoothstep(-aa, aa, d)`, where `aa` is
  `fwidth(d)`. That range is only valid while `aa` is positive, and GLSL leaves
  `smoothstep` undefined once `edge0 >= edge1` — so the shader was relying on a
  derivative it never checked.

  A zero derivative is not hypothetical. Magnifying the atlas makes a software
  rasteriser sample the same texel for all four fragments of a 2x2 quad:
  measured under SwiftShader, `fwidth` came back as exactly 0 — never negative,
  never NaN — on 9128 of 16384 pixels of one glyph. The undefined answer it then
  picked was the inverse of the letter, so text rendered as a solid block with
  the glyph punched out of it. Every still in `examples/assets/previews` was
  captured that way, since those run in headless Chromium.

  Both fragment shaders now floor the width at `MIN_AA`, orders of magnitude
  below any real derivative, so nothing changes where the derivative is usable
  and the degenerate case falls back to a hard edge instead of an undefined one.

- Updated dependencies [408df7e]
- Updated dependencies [be750e6]
- Updated dependencies [510ae40]
  - @hazumi/graphics@0.5.0
  - @hazumi/math@0.5.0
  - @hazumi/color@0.5.0
  - @hazumi/core@0.5.0

## 0.4.0

### Minor Changes

- 51cf458: Declare the backend capability contract instead of probing for it.

  `Renderer` now carries `setPasses`, `setTime` and `stats` as optional members
  beside `readPixels` and `writePixels`, so a backend author can see from the
  interface what implementing each one unlocks. Previously the runtime declared
  private structural types listing members `Renderer` never mentioned and probed
  for them with `typeof`, which made the whole capability contract discoverable
  only by reading L5's source. The runtime still guards at runtime — a capability
  really is optional — but the types it narrows to are now derived from the
  interface rather than restated beside it, so they cannot drift.

  `ShaderPass` and `FrameStats` move to `@hazumi/graphics`, which owns the
  contract. Both were previously declared more than once — `ShaderPass` three
  times over, agreeing only by coincidence of shape. `hazumi` re-exports them, so
  existing imports are unaffected.

  New exports: `ShaderPassesUnavailableError` from `hazumi`, thrown where a bare
  `Error` used to be when a scene asks for shader passes on a backend without a
  shader stage; and `toByte` from `@hazumi/color`, the 0-1 to 0-255 quantisation
  the Canvas2D and SVG backends had each copied.

### Patch Changes

- Updated dependencies [51cf458]
  - @hazumi/graphics@0.4.0
  - @hazumi/color@0.4.0
  - @hazumi/core@0.4.0
  - @hazumi/math@0.4.0

## 0.3.0

### Minor Changes

- 6206ffb: Add pooled particles and pin the scaffold to the library version.

  `particles()` is a fixed-capacity pool. `emit` bursts, `drip` emits at a
  rate without allocating a count each frame, and `draw(alpha)` interpolates
  from the previous update. Bursts take origin ranges, inherited `vx`/`vy`,
  rotation, and spin. The default paint is additive circles, or tinted sprites
  when the system or burst has an `image` — pass `Blend.Normal` for dust.
  `create-hazumi` no longer pins `hazumi` to its own semver; the generated app
  asks for `^0.3.0`.

### Patch Changes

- Updated dependencies [6206ffb]
  - @hazumi/core@0.3.0
  - @hazumi/math@0.3.0
  - @hazumi/color@0.3.0
  - @hazumi/graphics@0.3.0

## 0.2.1

### Patch Changes

- d49907a: Version the runtime packages together.

  `hazumi` and `@hazumi/*` now share a version via the changesets `fixed`
  group, so a bump in one package releases the whole library at the same
  number. `create-hazumi` stays independent.

- Updated dependencies [d49907a]
  - @hazumi/core@0.2.1
  - @hazumi/math@0.2.1
  - @hazumi/color@0.2.1
  - @hazumi/graphics@0.2.1

## 0.2.0

### Minor Changes

- a921c4c: Add image tint and source-rect crops.

  `tint()` / `noTint()` multiply images independently of fill, so distance fog
  no longer needs a second shape pass. `image()` accepts an optional source
  rectangle, and `sliceFrame()` crops a sprite without fabricating a fake frame.
  Scene factories keep the capability-import context across `await`.

### Patch Changes

- Updated dependencies [a921c4c]
  - @hazumi/graphics@0.2.0

## 0.1.1

### Patch Changes

- 21e6c3d: Point package homepage at the live site.
- Updated dependencies [21e6c3d]
  - @hazumi/color@0.1.1
  - @hazumi/core@0.1.1
  - @hazumi/graphics@0.1.1
  - @hazumi/math@0.1.1

## 0.1.0

### Minor Changes

First public release: a typed command buffer, WebGL2 as the primary renderer, Canvas2D as the pixel oracle, SVG export, and a headless recorder.

`start()` runs scenes with a fixed-step clock, capability imports (`hazumi/draw`, `hazumi/input`, `hazumi/scene`, `hazumi/assets`), a 2D camera, and typed plugins. Colour is OKLCH: `fill(oklch(0.7, 0.18, 250))` or `fill(rgb(255, 40, 20))`. CSS strings still parse.

Also in 0.1.0: SDF text, images and sprites, bezier paths, shader passes, pixel access, PNG capture, Web Audio, a rigid-body host, grid A*, a debug overlay, `create-hazumi`, and an optional Vite auto-import for `*.scene.ts` files.
