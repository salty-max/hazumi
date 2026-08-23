# @hazumi/physics

## 0.5.0

### Minor Changes

- be750e6: Make the rigid-body solver hold up: stacking, fast bodies, damping and sleeping.

  **Contacts are now resolved before the step moves anything.** The world used to
  integrate positions, then detect, then solve — so every impulse corrected a
  frame that had already been drawn. A six-box stack settled 65 units from where
  it was built with a crate turned upside down; it now ends 0.3 units off, and a
  settled pile costs less than half what it did because nothing churns.

  **A fast body can no longer cross something thin.** Contacts are found before
  the shapes touch, out to the distance the pair can close in one step, and the
  constraint lets them close exactly that much and no more. A 4-unit circle
  thrown at 6000 units a second used to pass straight through a 10-unit wall at
  any speed above 600; it now stops at the surface. Resting penetration dropped
  with it, because a body is held at the surface rather than pushed back out of
  it afterwards.

  **Restitution reads the impact speed before gravity is added**, so a bounce
  returns the height the coefficient predicts — 0.644 of the drop at e = 0.8,
  against 0.622 when this step's gravity was counted as part of the impact.

  **New: damping.** `linearDamping` and `angularDamping` on a body, or on the
  world as the default every new body starts with. Both are rates per second and
  both default to 0, which is the behaviour up to now.

  **New: sleeping.** A body that stays still stops being simulated, and
  `body.isAwake` says so. Sleeping is decided per island, not per body, so a
  crate at the bottom of a stack cannot settle under one still rocking above it.
  An impulse, a force, something arriving, or a neighbour being removed all wake
  it, and `world.wake(body)` is the manual door. A settled pile of 60 boxes went
  from 0.265 ms a step to 0.008. The debug overlay dims sleeping bodies and
  reports how many are awake.

  Friction now combines across a pair as the geometric mean rather than the
  larger of the two, so a body given `friction: 0` slides on a grippy floor
  instead of silently inheriting its grip.

  Sleeping zeroes velocity, so a body read after it has settled reports `vy` of
  exactly 0 rather than a residual.

  `physics()` takes the two damping options too, since its options extend the
  world's, and the debug overlay dims sleeping bodies and reports how many of
  them are awake.

### Patch Changes

- Updated dependencies [be750e6]
  - @hazumi/math@0.5.0
  - @hazumi/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [51cf458]
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

## 0.2.1

### Patch Changes

- d49907a: Version the runtime packages together.

  `hazumi` and `@hazumi/*` now share a version via the changesets `fixed`
  group, so a bump in one package releases the whole library at the same
  number. `create-hazumi` stays independent.

- Updated dependencies [d49907a]
  - @hazumi/core@0.2.1
  - @hazumi/math@0.2.1

## 0.1.1

### Patch Changes

- 21e6c3d: Point package homepage at the live site.
- Updated dependencies [21e6c3d]
  - @hazumi/core@0.1.1
  - @hazumi/math@0.1.1

## 0.1.0

### Minor Changes

First public release: a typed command buffer, WebGL2 as the primary renderer, Canvas2D as the pixel oracle, SVG export, and a headless recorder.

`start()` runs scenes with a fixed-step clock, capability imports (`hazumi/draw`, `hazumi/input`, `hazumi/scene`, `hazumi/assets`), a 2D camera, and typed plugins. Colour is OKLCH: `fill(oklch(0.7, 0.18, 250))` or `fill(rgb(255, 40, 20))`. CSS strings still parse.

Also in 0.1.0: SDF text, images and sprites, bezier paths, shader passes, pixel access, PNG capture, Web Audio, a rigid-body host, grid A*, a debug overlay, `create-hazumi`, and an optional Vite auto-import for `*.scene.ts` files.
