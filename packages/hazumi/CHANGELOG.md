# hazumi

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

### Patch Changes

- Updated dependencies [53835db]
- Updated dependencies [9d6f068]
  - @hazumi/backend-webgl2@0.6.0
  - @hazumi/math@0.6.0
  - @hazumi/physics@0.6.0
  - @hazumi/backend-canvas2d@0.6.0
  - @hazumi/backend-headless@0.6.0
  - @hazumi/backend-svg@0.6.0
  - @hazumi/color@0.6.0
  - @hazumi/graphics@0.6.0
  - @hazumi/audio@0.6.0
  - @hazumi/core@0.6.0

## 0.5.0

### Minor Changes

- 17ecb6e: Load more than images.

  `loadText`, `loadJson` and `loadFont` join `loadImage`. Asset loading stopped at
  images, which meant no way to read a level file, and no way for a game to ship
  its own typeface — text drawing could only use fonts the system already had.

  They are plain async functions taking a URL, because a scene factory is already
  async: `await loadJson("level.json")` in setup needs no preload phase and no
  loader to thread around. Each takes an optional `fetch`, so a test can inject a
  transport instead of stubbing a global.

  Failures now throw `AssetLoadError` rather than a bare `Error`, carrying the URL
  and — when the request completed — the status, so a 404 and a dropped connection
  are distinguishable. Invalid JSON says which file rather than surfacing a
  `SyntaxError` with no context.

  Deliberately uncached: the browser already caches the bytes, and a module-level
  map keyed by URL is an unbounded cache with no owner that would hold every asset
  any scene ever touched for the life of the page.

- 10fd57b: Declare an animation clip as a row of a sheet.

  Slicing a grid sheet into clips meant writing out linear frame indices, which
  are not what a sheet looks like: an animation sits on a row, and turning that
  row into `[8, 9, 10, 11, 12, 13]` means first working out the column count from
  the image size. Every clip then carries that count implicitly, so repacking the
  sheet silently points the clips at the wrong frames.

  `ClipOptions` now takes `row`, plus `from` and `to` for a slice of it — or a
  `from`/`to` run across the sheet when there is no row. The sheet resolves the
  run, because the sheet is what knows the grid. `frames` still takes an explicit
  list for a clip that repeats or reorders frames; declaring both, declaring
  neither, or naming a row or a run that falls outside the sheet throws
  `InvalidClipError` when the sheet is built rather than drawing the wrong sprite.

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

- a01aef4: Read Aseprite and Tiled exports directly.

  Spritesheets could only be described as a grid or as hand-written rectangles,
  and tilemaps as a hand-written array. But sprite work arrives as an Aseprite
  JSON export and levels arrive from Tiled, so both had to be retyped into source
  and kept in step — a copy that goes stale the first time an animation gains a
  frame.

  `fromAseprite` turns a sheet into named frames and clips. Per-frame durations
  become a rate plus repeats, which is the mechanism `ClipOptions` already
  documents for holding a frame longer, so 100ms followed by 200ms comes out as
  10fps with the second frame twice. Tags become clips, with `pingpong` and
  `reverse` handled and a fixed repeat count read as holding on the last frame.

  `fromTiled` turns a map into tilemap options, rebasing global ids onto each
  tileset's own indices and mapping gid 0 to the empty tile.

  Both are pure transforms — no fetching, no images — so they compose with
  `loadJson` and the caller supplies a spritesheet per tileset.

  They refuse rather than guess where the formats exceed what a tilemap can draw:
  a flipped or rotated tile would otherwise be painted the wrong way round, and a
  layer mixing two tilesets cannot batch into one run. Object groups are skipped
  rather than rejected, since a map legitimately carries them.

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

- b9fb35c: Tween values over time.

  Easings lived in `@hazumi/math` but nothing used them: interpolating a value
  meant writing the clamp, the normalise and the lerp by hand at every call site.

  `tween()` and `sequence()` fill that in, and they are sampled rather than
  ticked. `at(seconds)` is a pure function of elapsed time, holding no state and
  mutating nothing — the same shape animation clips already use. A tween that
  advances itself would have to be owned, updated once a frame, and cleaned up
  when whatever it animates disappears; a function of time can be shared by any
  number of entities, read out of order, rewound by passing a smaller number, and
  costs nothing while nothing is looking at it. It also keeps a scene as
  deterministic as its clock.

  `sequence()` chains tweens into one, and returns a `Tween` like any other, so
  sequences nest. Both reuse `ClipEnd` for what happens at the end, so holding,
  looping and ping-ponging mean the same thing here as they do for clips.

### Patch Changes

- Updated dependencies [408df7e]
- Updated dependencies [241c4b4]
- Updated dependencies [be750e6]
- Updated dependencies [510ae40]
  - @hazumi/graphics@0.5.0
  - @hazumi/backend-webgl2@0.5.0
  - @hazumi/math@0.5.0
  - @hazumi/physics@0.5.0
  - @hazumi/backend-canvas2d@0.5.0
  - @hazumi/backend-svg@0.5.0
  - @hazumi/backend-headless@0.5.0
  - @hazumi/color@0.5.0
  - @hazumi/audio@0.5.0
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
  - @hazumi/backend-canvas2d@0.4.0
  - @hazumi/backend-headless@0.4.0
  - @hazumi/backend-webgl2@0.4.0
  - @hazumi/backend-svg@0.4.0
  - @hazumi/graphics@0.4.0
  - @hazumi/color@0.4.0
  - @hazumi/audio@0.4.0
  - @hazumi/core@0.4.0
  - @hazumi/math@0.4.0
  - @hazumi/physics@0.4.0

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
  - @hazumi/backend-webgl2@0.3.0
  - @hazumi/backend-canvas2d@0.3.0
  - @hazumi/backend-svg@0.3.0
  - @hazumi/backend-headless@0.3.0
  - @hazumi/audio@0.3.0
  - @hazumi/physics@0.3.0

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
  - @hazumi/backend-webgl2@0.2.1
  - @hazumi/backend-canvas2d@0.2.1
  - @hazumi/backend-svg@0.2.1
  - @hazumi/backend-headless@0.2.1
  - @hazumi/audio@0.2.1
  - @hazumi/physics@0.2.1

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
