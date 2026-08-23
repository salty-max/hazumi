# Roadmap

What is built, what is next, and what is deliberately deferred. Numbers here
are measured, not estimated — when one goes stale, correct it rather than
dropping it.

**Where it stands:** `hazumi` is on npm. Runtime packages (`hazumi` and
`@hazumi/*`) share one version via a changesets `fixed` group. `create-hazumi`
is independent and pins the library range explicitly.

## Shipped

| Phase  | Delivered                                                                            |
| ------ | ------------------------------------------------------------------------------------ |
| P1 ✅  | Struct-of-arrays command buffer; instanced WebGL2 circles in one draw call           |
| P2 ✅  | `core`, `math`, `color` — clock, plugin registry, Vec/Mat4, seeded RNG, noise, OKLCH |
| P3 ✅  | Renderer subsystems, batching, state cache, and the Canvas2D reference oracle        |
| P4 ✅  | First vertical slice: `start()`, scenes, and the drawing API, `0.1.0`                |
| P5 ✅  | Runtime SDF text, then the SVG export backend                                        |
| P6 ✅  | Landing page, live playground, generated API reference                               |
| P7 ✅  | Images, sprites, bezier paths, shader passes, input, build-time auto-import          |
| P8 ✅  | Typed runtime plugins and Web Audio with bounded pooled voices                       |
| P9 ✅  | Runtime resize and DPR tracking, mutable pixels, and PNG frame capture               |
| P10 ✅ | Packed RGBA8 WebGL uploads for shapes, text, images, and paths                       |
| P11 ✅ | Image tint, source-rect crops, factory TLS across `await`, pooled particles          |
| P12 ✅ | Text metrics, depth layers, asset loaders, Aseprite/Tiled import, tweens             |
| P13 ✅ | Physics: contacts before motion, speculative contacts, sleeping, joints, queries     |

The measurements that back these:

| Claim                   | Measured                                                        |
| ----------------------- | --------------------------------------------------------------- |
| 100k shapes per frame   | 10.00 ms median, **1 draw call**, p95 11.50 ms                  |
| Encode cost             | 0.97 ms/frame flat fill, 1.84 ms with a fill per shape          |
| Steady-state allocation | 0 buffer growths, 0.0 kB heap delta over 200 frames             |
| Backend agreement       | 21 scenes, worst 1.81/255; all three image scenes exact at 0.00 |
| SVG vs Canvas2D         | worst 1.22/255 — tighter, since both go through the same engine |
| Sprite batching         | 400 sprites across 16 frames of one sheet → **1 draw call**     |
| Several sheets          | 3 sheets grouped → 3 calls; interleaved → 300                   |
| Context loss            | Recovered without reload, back to 1 draw call                   |
| Packed vertex upload    | 5.60 → 4.40 MB for 100k shapes (**−21.4%**)                     |
| Six-box stack drift     | 65.3 → 0.43 units once contacts resolve before motion           |
| Fast body vs thin wall  | crossed a 10-unit wall from 600 units/s; now held at any speed  |
| Settled pile of 60      | 0.265 → 0.005 ms/step once islands sleep                        |
| Broad phase, 1200 apart | 1.30 → 0.11 ms/step sweeping a sorted axis                      |

The application loop exposes the fixed-step clock through `start()`: a scene
may implement `update(fixedDt)` and `draw(alpha)`, with catch-up capped before a
stalled frame can create an unbounded simulation debt.

The Hazumi context also carries a 2D camera with pan, zoom, deterministic
following, screen↔world conversion, and an explicit screen-space block for HUD
drawing. Its identity default keeps existing scenes byte-for-byte unchanged.

Keyboard and pointer transitions are buffered into fixed-update snapshots.
Mouse, pen, and simultaneous touches share the Pointer Events path; complete
taps between ticks are retained, key repeat is ignored, and blur or pointer
cancellation synthesises missing release edges. Wheel deltas are normalized to
CSS pixels and consumed by one simulation tick. Gamepads are polled on that
same tick; axes, analog buttons, button edges, and disconnect releases are
available through the context.

Collision queries now cover point containment, static AABB/circle overlap,
finite raycasts, and swept AABB/circle impacts. Tangency and initial overlap
semantics are explicit, and every hit result can be reused without allocation.

Tilemaps now store mutable row-major layers, cull their traversal to the camera,
and emit each layer as one adjacent spritesheet run. Empty cells cost no command,
and invalid edits fail instead of silently wrapping to another frame.

Plugin builders can now be passed to `start()`. Their contributions are inferred
onto the scene context, their lifecycle hooks run with the application, and a
plugin cannot silently replace a built-in context member.

The audio plugin loads and decodes files through Web Audio, exposes one-shot and
looping playback with master and per-voice gain, unlocks on the first user gesture,
and caps simultaneous playback with reusable voice slots. Dungeon run exercises
the full path with ambience, impact, and victory sounds.

The canvas can now resize its logical surface and physical backing store in one
operation. Display pixel-ratio changes are tracked unless a ratio is explicitly
pinned. Canvas2D applies the logical-to-physical transform and WebGL2 updates its
viewport, so neither backend deforms scene geometry.

Both raster backends expose owned, top-down straight-alpha RGBA snapshots through
`loadPixels()`. `Pixels.get()` and `set()` edit physical pixels,
`updatePixels()` writes them back, and `capturePng()` encodes the current frame
without depending on a preserved browser drawing buffer. The WebGL upload is a
single retained resource, so repeated updates and context restoration do not grow
the GPU registry.

WebGL dynamic buffers now carry colours as normalized RGBA8 rather than four
floats. Shape and textured instances shrink from 56 to 44 bytes, while path
vertices shrink from 24 to 12. The 100k-shape workload transfers 4.40 MB per
frame instead of 5.60 MB; current Chrome medians remain within the pre-change
8.8–9.2 ms variance, so the bandwidth reduction is claimed without pretending
it is a separately measurable frame-time win.

`create-hazumi` is the consumer path: a short wizard (name, sketch vs game)
writes a Vite app, and `vite build` emits a static `dist/` you zip for itch.io
or GitHub Pages. The published CLI pins `hazumi` to the current library range,
not to its own version. `--local` still wires `file:` paths inside this repo.

`particles()` is a fixed-capacity pool. `emit` / `drip` / `update` / default
`draw` allocate nothing after construction. `draw(alpha)` interpolates
position, angle, and size from the previous update. The default paint is
additive circles via `fillRgba()`, or tinted sprites when the system has an
`image`. A custom `paint` can still take over. The command buffer stores
circles and images, not tessellated quads.

Plugins now have `preupdate` / `postupdate` on the fixed clock, distinct from
the frame `predraw` / `postdraw`. `@hazumi/physics` hosts the math solver on
that update hook. The debug overlay in L5 draws stats and body outlines after
the scene. Grid A* lives in `@hazumi/math` as `pathfind`, beside `collision`.

The 2D engine gained the pieces a game reaches for and could not find: text
measurement and wrapping, depth layers, loaders for text, JSON and fonts,
Aseprite and Tiled importers, sampled tweens, and clips declared as a row of a
sheet rather than as linear frame indices.

The rigid-body solver was then rebuilt where it mattered. Contacts resolve
before the step moves anything, which is what makes stacks hold; contacts are
found before shapes touch, out to the distance a pair can close in a step,
which is what stops a fast body crossing a thin one. Bodies that stay still
stop being simulated, in islands rather than one at a time. Joints — distance
and pin — sit in the same solver, and the world answers raycasts and point
queries against bodies rather than only against loose AABBs.

## Deferred by decision

- **WebGPU.** A backend at parity with WebGL2 — shapes, glyphs, images,
  post-processing — is about the size of the WebGL2 backend itself (~2,400
  lines), so it is a phase rather than a task, and it sits near 70% browser
  support against WebGL2's 97%. The architecture is ready: SVG and headless
  already prove the command buffer is renderer-neutral, so WebGPU arrives as a
  fourth consumer, not a rewrite.
- **3D.** Ships 2D. The hedge is paid in exactly three places — `Mat4` in the
  transform stack, a camera sized for perspective, and a framebuffer chain
  parameterised over attachments — and nowhere else. Do not add z to the 2D
  instance layouts; that is the performance path.

## Known divergences

Not bugs, and not scheduled to be fixed — recorded so they are not rediscovered.

- **Stroke under anisotropic scale.** Both backends scale stroke with the
  transform but distribute it differently, so the comparison scenes use uniform
  scale only.
- **Text renders from an SDF, not from native text.** The GPU path builds a
  signed distance field at runtime where Canvas2D and SVG use the browser's own
  rasteriser. The two were assumed too different to compare and left out of the
  harness for it — which is exactly why a shader bug that drew every glyph
  inside-out shipped. They are compared now and agree to 1.16/255: close enough
  to gate on, not close enough to expect zero.
- **SDF, not MSDF.** Corners soften well above the atlas resolution. MSDF holds
  them sharp but needs an offline generator, which would mean a build step and
  an atlas to ship.

## Housekeeping

- The phase table in [README.md](README.md) quotes figures from when each phase
  closed (253 tests, 10 comparison scenes, five examples). Those are historical rather than
  wrong, but the current numbers are at the top of this file.
