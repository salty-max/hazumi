# @hazumi/backend-headless

## 0.7.0

### Minor Changes

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

### Patch Changes

- 2f3e030: Every member of every exported interface and class is now documented.

  The last pass covered exports and stopped there, which left 290 members bare:
  `RigidBody.invMass`, `InputState.previousMouseX`, `Tilemap.rowAt`, every
  channel of every colour type. On hover they showed a type and nothing else,
  which is the point at which a reader goes and opens our source — the thing the
  reference exists to prevent.

  They say what a type cannot: that `Aabb.minY` is the top edge because y grows
  downwards, that `RigidBody.invMass` is zero for a static body and that this is
  how "infinitely heavy" is expressed without a special case, that
  `Circle.radius` is a radius while `circle()` takes a diameter.

  A test now fails the build on any export or member without one, so the
  next thing added is documented when it is added rather than in a pass a year
  later.

- Updated dependencies [5766e46]
- Updated dependencies [536ec2c]
- Updated dependencies [2f3e030]
- Updated dependencies [f958d70]
- Updated dependencies [412105e]
- Updated dependencies [7f0edaf]
- Updated dependencies [69f856d]
  - @hazumi/graphics@0.7.0
  - @hazumi/math@0.7.0
  - @hazumi/color@0.7.0
  - @hazumi/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [9d6f068]
  - @hazumi/math@0.6.0
  - @hazumi/color@0.6.0
  - @hazumi/graphics@0.6.0
  - @hazumi/core@0.6.0

## 0.5.0

### Patch Changes

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
