# Roadmap

What is built, what is built but not reachable, and what is next. Numbers here
are measured, not estimated — when one goes stale, correct it rather than
dropping it.

**Where it stands:** 0.1.0, pre-alpha. 10 packages, 566 unit tests, 19
backend-agreement scenes, 12 example sketches. Not published to npm.

## Shipped

| Phase | Delivered |
| --- | --- |
| P1 ✅ | Struct-of-arrays command buffer; instanced WebGL2 circles in one draw call |
| P2 ✅ | `core`, `math`, `color` — clock, plugin registry, Vec/Mat4, seeded RNG, noise, OKLCH |
| P3 ✅ | Renderer subsystems, batching, state cache, and the Canvas2D reference oracle |
| P4 ✅ | First vertical slice: `sketch()`, the drawing API, `0.1.0` |
| P5 ✅ | Runtime SDF text, then the SVG export backend |
| P6 ✅ | Landing page, live playground, generated API reference |
| P7 ✅ | Images, sprites, bezier paths, shader passes, input, build-time auto-import |

The measurements that back these:

| Claim | Measured |
| --- | --- |
| 100k shapes per frame | 10.00 ms median, **1 draw call**, p95 11.50 ms |
| Encode cost | 0.97 ms/frame flat fill, 1.84 ms with a fill per shape |
| Steady-state allocation | 0 buffer growths, 0.0 kB heap delta over 200 frames |
| Backend agreement | 19 scenes, worst 1.81/255; all three image scenes exact at 0.00 |
| SVG vs Canvas2D | worst 1.22/255 — tighter, since both go through the same engine |
| Sprite batching | 400 sprites across 16 frames of one sheet → **1 draw call** |
| Several sheets | 3 sheets grouped → 3 calls; interleaved → 300 |
| Context loss | Recovered without reload, back to 1 draw call |

The game loop now also exposes the fixed-step clock through `sketch()`: setup
may return `update(fixedDt)` and `draw(alpha)`, with catch-up capped before a
stalled frame can create an unbounded simulation debt.

The sketch context also carries a 2D camera with pan, zoom, deterministic
following, screen↔world conversion, and an explicit screen-space block for HUD
drawing. Its identity default keeps existing sketches byte-for-byte unchanged.

## Built but not reachable

One subsystem is implemented and tested but nothing consumes it. This is a
wiring job, not a design job — which makes it the cheapest real progress
available.

- **The plugin system.** `definePlugin` and `createSketch` accumulate a
  plugin's contributions into the sketch type with no declaration merging, and
  the types are verified at compile time. But `SketchOptions` has no `plugins`
  field and nothing in the repo calls either function. The typed extension
  story currently cannot be used from `sketch()`.
  → [plugin.ts](packages/core/src/plugin.ts), [sketch.ts](packages/matter/src/sketch.ts)

## Next: making games viable

Sprites and animation clips landed; these are what still stands between the
library and a real 2D game, roughly in dependency order.

1. **Input edge detection.** `keyIsDown`, `mouseX/Y`, `mouseIsPressed` and
   friends report *state*. A game needs *transitions* — `justPressed`,
   `justReleased` — which cannot be derived correctly by a sketch polling once
   per frame. Also missing: pointer/touch events, wheel, and gamepad.
   → [sketch.ts:242](packages/matter/src/sketch.ts:242)
2. **Collision math** in `@matter/math`: AABB and circle overlap, point
   containment, ray casts, and swept tests for tunnelling at speed. Pure
   functions, `bun test`-able, no renderer involved.
3. **Tilemaps.** Spritesheets give the frames; a tilemap gives the layout,
   culling to the camera, and one draw call per layer.
4. **Audio.** Nothing exists. Needs load, play, loop, gain, and pooled voices.
   Likely the first real candidate for the plugin system rather than L5.

## Library gaps, independent of games

- **Pixel access.** No `loadPixels`/`get`/`set`. Genuinely absent, and a
  common expectation for a drawing library.
- **Canvas export.** SVG export works via `toSvg()`; there is no PNG-or-frame
  save path from the sketch API.
- **Canvas resize.** `pixelRatio` is read once at construction and there is no
  `resize` listener, so a sketch does not respond to a window resize.
  → [sketch.ts:170](packages/matter/src/sketch.ts:170)
- **Colour packing.** Instances carry colour as four floats. Packing into a
  `u32` would recover roughly a fifth of the upload bandwidth — the clearest
  remaining performance win, and already identified as such.
- **npm publish.** Changesets is configured; nothing has been released.

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
- **Text is outside backend comparison.** The GPU path renders glyphs from a
  signed distance field while Canvas2D and SVG use native text. These cannot
  match pixel for pixel by construction.
- **SDF, not MSDF.** Corners soften well above the atlas resolution. MSDF holds
  them sharp but needs an offline generator, which would mean a build step and
  an atlas to ship.

## Housekeeping

- `bench/sheetinfo.html` was a scratch page for identifying which spritesheet
  row is which facing. It is committed but undocumented, and the question it
  was built to answer is still open — the Blood Mage clips are named `f0`–`f3`
  because the facing order was never confirmed.
- The phase table in [README.md](README.md) quotes figures from when each phase
  closed (253 tests, 10 scenes, five sketches). Those are historical rather than
  wrong, but the current numbers are at the top of this file.
