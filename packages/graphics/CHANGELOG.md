# @hazumi/graphics

## 0.7.0

### Minor Changes

- 5766e46: `capabilities` — a scene can ask what its backend can do.

  Not every backend can run a shader over the frame, hand back its own pixels, or
  measure a line of text: the SVG exporter has no raster to read, and the headless
  recorder has no font to measure against. That was already the shape of the
  contract — optional members on `Renderer` — but only the runtime could see it.
  A scene found out by calling and being thrown at, which is fine for a mistake
  and no use at all for a decision.

  ```ts
  import { capabilities, setPasses } from "hazumi/scene";

  if (capabilities.shaders) setPasses([{ fragment: GRADE }]);
  ```

  Three flags — `shaders`, `pixels`, `text` — derived from what the backend
  implements, using the same tests the runtime already used to decide whether to
  throw. So a scene that checks and skips is right to skip, and one that calls
  anyway still gets the error it always got.

  This is what makes a feature that only some backends can offer a reasonable
  thing to add at all. A scene stops being "the same picture everywhere" and
  becomes "the same scene, asking for what it can have" — the dungeon and the
  raycaster now light themselves where a shader is available and draw plainly
  where it is not, instead of failing.

- 536ec2c: Per-sprite materials: `flash`, `outline`, `dissolve`.

  ```ts
  material({ type: "flash", amount: hit / FLASH_FOR });
  image(enemy, x, y);
  ```

  The question this answers is one the engine kept saying no to: a shader on one
  sprite rather than on the whole frame. A post pass is the frame, and the three
  things a game actually wants — a hit flash, a border that separates a unit from
  the ground it stands on, a death that eats the sprite away — are none of them
  frame-wide.

  Saying yes literally, as "your fragment shader here", would have cost more than
  it gave. A program per sprite is a draw call per sprite, and batching is the one
  performance property this renderer is built around. So the material rides in the
  instance data instead: two extra words, a kind and three parameter bytes, which
  means sprites wearing different materials still merge into a single draw call.
  That is what makes the vocabulary closed — the branch has to be written once, in
  the shader — and it is worth the closure. `checks/materials.ts` draws eight
  sprites in eight different materials and asserts the frame took one draw call.

  The cost is two words on every textured instance whether it wears a material or
  not: 44 bytes to 52, an 18% wider upload for sprites and glyphs. Shape instances
  are untouched, and no draw-call count changes.

  Materials apply to images and to text. `outline` is images only — it works by
  sampling neighbouring texels, and a glyph is a distance field rather than pixels
  — and it needs a texel of empty space inside the frame to draw into. Only WebGL2
  implements them; `capabilities.materials` says so, and a backend without them
  draws the sprite plain rather than failing.

- f958d70: A shader pass can sample images, not just numbers.

  `ShaderPass.textures` binds images to sampler names the pass declares. It is for
  what a shader cannot work out from the frame — and the clearest case is light.
  A screen-space glow can spread beautifully and has no idea what it is spreading
  across: light stops at a wall because of where the wall _is_, and that is in the
  map, not in the picture. Hand the pass a light map worked out against the map
  and the wall casts a shadow.

  Same shape for a palette to look colours up in, a mask, a noise field, a
  lookup table.

  Pass textures are always filtered, whatever the renderer's `smoothing` is set
  to. They are data rather than art: a renderer set to `smoothing: false` for
  pixel art would otherwise sample a light map with nearest and hand back a grid
  of squares. Draw them at whatever resolution the data deserves and let the
  hardware interpolate.

  Bound from unit two — zero is the previous pass, one is the scene — and cached
  per image, so handing the same one every frame uploads it once.

- 412105e: `Scene.overlay` — drawing that the shader chain does not touch.

  Post-processing belongs to the world. Until now it also belonged to everything
  drawn on top of it, because the chain runs over the whole frame: a heads-up
  display went through the same passes as the scene, so it was dimmed by the
  world's lighting, warped by its warp and bloomed by its bloom. A scene lit by a
  multiply pass finds this immediately — its caption comes out at a fraction of
  the brightness it was drawn with, and there is no layer to move it to.

  A scene may now declare `overlay(alpha, ctx)` alongside `draw`. It is a second
  command stream, rendered after the chain has presented and straight onto the
  canvas. Anything meant for the reader rather than for the world goes there: a
  score, a control legend, a debug readout.

  `Renderer.render` takes an optional second argument for this, `{ passes: false }`.
  A backend with no chain can ignore it — for it every stream is already drawn the
  same way — so a scene written this way looks identical on all four.

### Patch Changes

- Updated dependencies [2f3e030]
- Updated dependencies [7f0edaf]
- Updated dependencies [69f856d]
  - @hazumi/math@0.7.0
  - @hazumi/color@0.7.0
  - @hazumi/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [9d6f068]
  - @hazumi/math@0.6.0
  - @hazumi/color@0.6.0
  - @hazumi/core@0.6.0

## 0.5.0

### Minor Changes

- 408df7e: Order drawing by depth with `layer()`.

  Draw order was call order, full stop. That is the right default and it is what
  keeps overlapping transparency correct — batching merges only _adjacent_
  commands — but it left no way to say a player passes behind a tree, or that a
  HUD belongs above everything, without restructuring the scene around the
  painter's algorithm.

  `layer(depth, body)` overrides call order and only call order: within one depth,
  and inside a block, calls still paint in sequence, so sorting entities by y and
  drawing them in a loop behaves as written. Unlayered drawing sits at depth 0.

  Style and transform are scoped to the block, which is load-bearing rather than
  tidy — a layer that leaked a fill would change another layer's colour depending
  on which depth sorted first.

  The sort happens once, on the buffer, before any backend sees the stream:
  `CommandBuffer.reorderSegments` rewrites the recorded words into paint order, so
  the stream every backend walks is still a linear list and none of them change.
  It is stable, reuses its scratch across frames, and leaves the side tables
  alone — strings and images are referenced by index, and moving the words that
  hold those indices does not move what they point at.

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

- Updated dependencies [be750e6]
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

## 0.2.0

### Minor Changes

- a921c4c: Add image tint and source-rect crops.

  `tint()` / `noTint()` multiply images independently of fill, so distance fog
  no longer needs a second shape pass. `image()` accepts an optional source
  rectangle, and `sliceFrame()` crops a sprite without fabricating a fake frame.
  Scene factories keep the capability-import context across `await`.

## 0.1.1

### Patch Changes

- 21e6c3d: Point package homepage at the live site.
- Updated dependencies [21e6c3d]
  - @hazumi/color@0.1.1
  - @hazumi/core@0.1.1
  - @hazumi/math@0.1.1

## 0.1.0

### Minor Changes

First public release: a typed command buffer, WebGL2 as the primary renderer, Canvas2D as the pixel oracle, SVG export, and a headless recorder.

`start()` runs scenes with a fixed-step clock, capability imports (`hazumi/draw`, `hazumi/input`, `hazumi/scene`, `hazumi/assets`), a 2D camera, and typed plugins. Colour is OKLCH: `fill(oklch(0.7, 0.18, 250))` or `fill(rgb(255, 40, 20))`. CSS strings still parse.

Also in 0.1.0: SDF text, images and sprites, bezier paths, shader passes, pixel access, PNG capture, Web Audio, a rigid-body host, grid A*, a debug overlay, `create-hazumi`, and an optional Vite auto-import for `*.scene.ts` files.
