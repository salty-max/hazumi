# @hazumi/math

## 0.6.0

### Minor Changes

- 9d6f068: Joints, world queries, and a broad phase that stops being quadratic.

  **Joints.** `addDistanceJoint` holds two anchors a fixed distance apart — a rod,
  or a rope pulled taut — and `addPinJoint` holds them at the same point while
  leaving rotation free. Either can tie two bodies together or pin one to a point
  in the world. Anchors are local to each body and default to its centre.
  `removeJoint` cuts one, removing a body takes its joints with it, and joints
  join sleep islands so a rope sleeps and wakes as one piece.

  **Queries against the world.** `raycast` returns the nearest body a ray meets
  and writes the point, normal and distance into a `RayHit` the caller owns, so a
  shot costs no allocation; `ignore` skips whatever fired it. `pointQuery` returns
  the body under a point, latest first, which is what picking wants. Both find
  sleeping bodies — sleeping is a shortcut the solver takes, not invisibility.
  Until now a ray could only be cast against loose AABBs, never against the
  bodies actually in the world.

  **Sweep and prune.** Pairs were found by testing every body against every other,
  which is fine for a handful and quadratic after that. Sorting on one axis and
  walking forward only while intervals overlap makes the cost grow with the number
  of bodies instead: 1200 spread-out bodies went from 1.30 ms a step to 0.11 ms,
  and 600 from 0.31 ms to 0.05 ms. Body bounds are also computed once per step
  rather than recomputing two cosines and two sines inside every pair test.

  Pairs now carry a stable A/B identity taken from creation order. The sweep
  visits them in whatever order it reaches them, and a contact whose two bodies
  had swapped places matched no warm-start entry, leaving the solver to
  rediscover every accumulated impulse from nothing — a heap of 80 boxes took
  until frame 417 to settle instead of 175, and 160 never settled at all.

  Joint length is restored by a position pass that runs four times a step. Once
  is not enough: the velocity solve only removes relative motion along the joint,
  so a chain struck side-on sat 1.5% long and stayed there while it swung.
  Measured residual after ten seconds — one pass 1.5%, four passes 0.23% — and
  the pendulum's worst anchor drift fell from 1.13 units to 0.22 with it.

  Removing a body removes the joints attached to it, which is what stops a
  constraint solving against a body the world no longer owns. A scene that culls
  its oldest body to stay under a budget needs to cull from what it spawned:
  otherwise it works through its own scenery and takes a rope apart one link at
  a time.

  A joint's anchors are mutable, because a joint that cannot move its anchor
  cannot follow anything: dragging a body with the pointer is a joint pinned to
  the world whose world anchor is moved to the cursor each frame. That is what
  the new `chain` example does — grab a link, pull, and watch the readout say
  how far the chain gave and whether it came back.

  Bodies a joint holds together no longer collide with each other, which
  `collideConnected` turns back on. A wheel's axle sits inside the chassis it
  turns on by construction, and a contact there spends the whole step arguing
  with the joint: the `bike` example could not move at all until this went in.

  A distance joint can be a spring rather than a rod: `stiffness`, in
  oscillations per second, and `damping` as a fraction of critical. It is a
  proper soft constraint — compliance and bias derived from the frequency, not a
  position bias bolted onto the velocity solve — so it does not pump energy.
  Measured on a hanging weight: 1Hz oscillates at 1.0Hz, 3Hz at 2.7Hz, damping 1
  settles without overshoot, and 0 is exactly as rigid as before. Suspension
  falls out of it, which is what the `bike` example rides on.

  `applyTorque` spins a body without pushing it anywhere. A force at an offset
  point turns a body and shoves it at the same time, which is not what driving a
  wheel or leaning a rider does.

  `world.joints` lists the constraints, and the debug overlay draws them.

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

## 0.2.1

### Patch Changes

- d49907a: Version the runtime packages together.

  `hazumi` and `@hazumi/*` now share a version via the changesets `fixed`
  group, so a bump in one package releases the whole library at the same
  number. `create-hazumi` stays independent.

## 0.1.1

### Patch Changes

- 21e6c3d: Point package homepage at the live site.

## 0.1.0

### Minor Changes

First public release: a typed command buffer, WebGL2 as the primary renderer, Canvas2D as the pixel oracle, SVG export, and a headless recorder.

`start()` runs scenes with a fixed-step clock, capability imports (`hazumi/draw`, `hazumi/input`, `hazumi/scene`, `hazumi/assets`), a 2D camera, and typed plugins. Colour is OKLCH: `fill(oklch(0.7, 0.18, 250))` or `fill(rgb(255, 40, 20))`. CSS strings still parse.

Also in 0.1.0: SDF text, images and sprites, bezier paths, shader passes, pixel access, PNG capture, Web Audio, a rigid-body host, grid A*, a debug overlay, `create-hazumi`, and an optional Vite auto-import for `*.scene.ts` files.
