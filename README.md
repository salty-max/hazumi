# Matter

A typed 2D graphics library for interactive scenes, generative work and games. The
drawing API does not rasterise — it encodes a command stream that WebGL2,
Canvas2D, SVG and a headless recorder each consume on their own terms.

> **Status: 0.1.0, pre-alpha.** The drawing API, bezier paths, SDF text,
> images, sprites, shader passes and SVG export all work, with twelve example
> scenes running on them. Not published to npm.

## Why

Drawing APIs usually rasterise as you call them, which welds what you drew to
how it was drawn: the output cannot be exported as vectors, re-rendered at
another resolution, or tested without a browser and a pixel diff. Renderers
built for GPU throughput avoid that by handing you buffers and pipelines
instead — at which point a circle stops being one line of code.

Matter keeps the short API and puts a typed command buffer behind it. One
scene can therefore run a hundred thousand shapes in a single draw call,
export as an SVG with real curve commands, and assert in a unit test with no
browser involved. Shaders are a normal feature rather than an escape hatch.

## A scene

```ts
import { start } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

start({ backend: webgl2(), width: 600, height: 600 }, () => {
  return {
    draw(_alpha, { background, circle, fill, width, height, t }) {
      background('oklch(0.15 0.02 260)');
      fill('oklch(0.7 0.18 250)');
      circle(width / 2, height / 2, 200 + Math.sin(t) * 80);
    },
  };
});
```

The context is destructured in the draw callback rather than injected onto
`window`. That keeps the terseness of a global-style scene — bare `circle`,
`fill`, `width` — while staying fully typed, and because the same object is
mutated in place, reading `t` or `width` costs nothing per frame.

Style can be scoped instead of pushed and popped:

```ts
with({ fill: 'red', stroke: null }, () => {
  drawPetals();
});
```

It restores on exit *including when the body throws*, which is the failure
`push()`/`pop()` cannot protect you from.

## A fixed-step game

A scene can implement separate `update` and `draw` callbacks. Simulation
runs at the configured fixed rate; rendering still follows the display and
receives an interpolation alpha:

```ts
start(
  { backend: webgl2(), clock: { fixedStep: 1 / 60 } },
  () => {
    let previousX = 100;
    let x = 100;

    return {
      update(dt, { keyIsDown, keyJustPressed }) {
        previousX = x;
        if (keyIsDown('ArrowRight')) x += 120 * dt;
        if (keyJustPressed(' ')) jump();
      },
      draw(alpha, { background, circle, fill }) {
        background('#111827');
        fill('#60a5fa');
        circle(previousX + (x - previousX) * alpha, 300, 32);
      },
    };
  },
);
```

Catch-up is capped by default, so returning to a backgrounded tab cannot trap
the simulation in an ever-growing backlog. `maxDelta` and `maxFixedSteps` are
available under `clock` when a game needs different limits.

`keyJustPressed`, `keyJustReleased`, `pointerJustPressed` and
`pointerJustReleased` are visible for exactly one fixed update. A complete tap
between two updates still reports both edges, while browser key repeat does
not create extra presses. `pointers` exposes mouse, pen, and every simultaneous
touch in logical canvas coordinates; a released contact remains in the list
for its release update so its final position is available. `wheelX` and
`wheelY` similarly accumulate once per update in CSS pixels.

The existing `mouseX`, `mouseY`, `mouseIsPressed`, `mouseJustPressed`, and
`mouseJustReleased` fields remain as convenient aliases for the primary
pointer.

Gamepads are polled at the start of each fixed update. `gamepads` exposes axes
and analog button values, while `gamepadButtonIsDown`,
`gamepadButtonJustPressed`, and `gamepadButtonJustReleased` provide the usual
button state. Disconnecting a held controller reports release edges before it
leaves the list. Unlike DOM events, polling cannot observe a complete press and
release that happens between two updates.

## Collision queries

`collision` groups allocation-optional 2D queries in `@matter/math`. Static
overlaps include touching edges; sweeps return the earliest safe fraction of a
tick, so a fast object cannot tunnel through a thin wall:

```ts
const reusableHit = collision.createSweepHit();
const player = collision.aabb(x, y, 24, 24);
const movement = vec2.vec2(velocity.x * dt, velocity.y * dt);
const hit = collision.sweepAabb(player, movement, wall, reusableHit);

if (hit) {
  x += movement.x * hit.time;
  y += movement.y * hit.time;
}
```

Point containment, AABB/circle overlap, raycasts, and circle sweeps follow the
same shape-first naming. `createRayHit()` and `createSweepHit()` produce reusable
outputs for hot loops.

## World and screen space

Every context carries a camera. Its position is the world coordinate shown at
the centre of the canvas; the default preserves the original canvas coordinate
system exactly:

```ts
return {
  update(dt, { camera }) {
    movePlayer(dt);
    camera.follow(player.x, player.y, 0.12);
    camera.setZoom(2);
  },
  draw(alpha, { background, camera, circle, text }) {
    background('#111827'); // always covers the screen
    circle(player.x, player.y, 32); // world space

    camera.screen(() => {
      text('HP 100', 16, 24); // HUD, unaffected by pan or zoom
    });
  },
};
```

`screenToWorld()` maps pointer coordinates into the world, and
`worldToScreen()` does the reverse. Both accept an optional reusable output
point for allocation-free use in a hot loop.

Run `bun run dev` and open
http://localhost:5199/examples to see the twelve scenes in
`examples/`.

## Design in one page

The user's `draw()` does not paint. It encodes high-level commands — *circle at
xy, radius r* — into a struct-of-arrays typed-array buffer, which a backend then
consumes. Immediate-mode ergonomics on the outside, retained-mode data inside.

Four things fall out of that:

- **Vector export.** SVG is just another buffer consumer.
- **Real unit tests.** The headless backend records the command stream, so tests
  assert on what was drawn instead of pixel-diffing a browser.
- **Deterministic recording.** Seeded RNG plus a decoupled clock means a scene
  re-runs frame-by-frame at any resolution and produces identical output.
- **A tractable GPU path.** Backends batch by sorting commands rather than
  re-implementing the drawing API.

The WebGL2 backend draws circles, rounded rects, arcs and lines as instanced
quads with the shape evaluated analytically in the fragment shader — perfect
antialiasing at any zoom, no tessellator, and ten thousand circles in one draw
call.

## Layers

```
L0 core  →  L1 math  →  L2 color  →  L3 graphics  →  L4 backends  →  L5 matter
```

Imports only ever go left to right. See [AGENTS.md](AGENTS.md) for the rules.

## Build order

All seven phases are delivered. [ROADMAP.md](ROADMAP.md) has the current
state, what is built but not yet reachable, and what comes next.

| Phase | Work | Done when |
| --- | --- | --- |
| P1 ✅ | Command buffer + minimal instanced WebGL2 path | **Met** — see measurements below |
| P2 ✅ | core, math, color | **Met** — 253 tests; plugin types verified at compile time |
| P3 ✅ | Renderer subsystems + Canvas2D oracle | **Met** — 10/10 scenes agree, mean diff ≤ 1.8/255 |
| P4 ✅ | First vertical slice, `0.1.0` | **Met** — five scenes in `examples/`, no escape hatches |
| P5 ✅ | Text, then SVG backend | **Met** — 12 scenes export and rasterise to within 0.31/255 |
| P6 ✅ | Docs + playground | **Met** — landing page, live editor, 184-symbol reference |
| P7 ✅ | Breadth: images, sprites, paths, shaders, input, auto-import | **Met** — WebGPU deferred by decision, see below |

## P1 measurements

Encode path, Bun, 100k circles per frame over 200 frames. Two workloads, because
a single shared fill and a fill per shape are different amounts of work — the GPU
bench below uses the second:

| Metric | Flat fill | Fill per shape |
| --- | --- | --- |
| Encode time per frame | 0.97 ms (5.8%) | 1.84 ms (11.0%) |
| Throughput | 103M shapes/sec | 54M shapes/sec |
| Buffer growths in steady state | 0 | 0 |
| Heap delta over 200 frames | 0.0 KB | 0.0 KB |

GPU path, Chrome, 100k circles per frame over 120 frames, each frame forced to
complete with a 1×1 `readPixels`:

| Metric | Result |
| --- | --- |
| Frame time (median) | 10.00 ms (60% of the 16.67 ms budget) |
| Frame time (p95) | 11.50 ms |
| Draw calls per frame | 1 |
| Instance-array growths in steady state | 0 |
| Forced context loss | Recovered without reload, 1 draw call after restore |

P3 grew instances from 7 floats to 14 to carry transform, extents and stroke,
moving the median from 7.50 ms to 10.00 ms. Packing colour into a `u32` would
recover roughly a fifth of that upload bandwidth and is the obvious next step.

## Backend agreement

Canvas2D is the reference renderer. Nineteen scenes render through both backends
and are compared pixel by pixel — mean per-channel difference over the frame,
out of 255. The worst is 1.81; the image scenes are exact:

| Scene | Mean diff | Draw calls |
| --- | --- | --- |
| filled circles | 0.42 | 1 |
| filled rects | 0.68 | 1 |
| non-square rect strokes | 1.75 | 1 |
| circle strokes | 0.93 | 1 |
| lines | 1.81 | 1 |
| overlapping transparency | 0.34 | 1 |
| interleaved blend modes | 0.56 | 10 |
| transform stack | 0.61 | 1 |
| camera world and screen space | 0.42 | 1 |
| uniform scale with stroke | 0.62 | 1 |
| ellipses | 1.69 | 1 |
| translucent background over content | 0.42 | 1 |
| filled bezier path | 0.25 | 2 |
| path with a hole | 0.00 | 2 |
| stroked path | 0.35 | 1 |
| spritesheet frames | 0.00 | 1 |
| spritesheet frames from an ImageBitmap | 0.00 | 1 |
| whole image | 0.00 | 2 |
| push/pop restores style | 0.43 | 1 |

Two independent rasterisers never match bit-for-bit on antialiased edges, so
the bar is "no visible difference", not "identical". The interleaved-blend
scene takes ten draw calls by design: merging non-adjacent instances would
reorder overlapping transparent shapes.

Run it with `bun run dev` and open
http://localhost:5199/bench/compare.html.

SVG is rasterised through the browser and diffed against Canvas2D as well.
Several scenes come out pixel-identical and the worst is 1.22, because both go
through the same engine — so that tolerance is set *tighter* than the GPU one.

## WebGPU

Deferred, deliberately. A WebGPU backend at parity with WebGL2 — shapes,
glyphs, images, post-processing — is about the size of the WebGL2 backend
itself, roughly 2,400 lines, so it is a phase rather than a task. It also sits
near 70% browser support against WebGL2's 97%.

The architecture is ready for it: a backend implements three methods, and the
SVG and headless backends already demonstrate that the command buffer is
genuinely renderer-neutral. WebGPU arrives as a fourth consumer, not a rewrite.

**Known divergences.** Stroke width under anisotropic scale: both backends
scale stroke with the transform but distribute it differently, so the
comparison scenes use uniform scale only. And text is outside the comparison
entirely — the GPU path renders glyphs from a signed distance field while
Canvas2D and SVG use native text, which cannot match pixel for pixel by
construction.

## Sprites

`spritesheet()` slices an image into frames, and `image()` takes a frame
wherever it takes an image:

```ts
const sheet = spritesheet(await loadImage('tiles.png'), { frame: [16, 16] });
image(sheet.at(3, 1), x, y);
```

This is what makes 2D games viable. Batching merges only *adjacent* instances —
which is what keeps transparency correct — so separate images never merge and
sprites always interleave. Measured: 400 draws across 8 images cost **400 draw
calls**; 400 sprites across 16 frames of one sheet cost **one**.

Frames are precomputed and returned by reference, so a draw loop asking for the
same frame every frame allocates nothing. Indices wrap, so `frame(t)` loops.

Image textures upload *unflipped*, and the quad's UVs run top-down to match.
This is deliberate: WebGL honours `UNPACK_FLIP_Y_WEBGL` for a canvas or `<img>`
but silently ignores it for an `ImageBitmap`, which is exactly what
`loadImage()` returns — so flipping on upload makes a texture's orientation
depend on how the caller happened to decode the picture. Two comparison scenes
draw the same frames from both source types for this reason.

### Animations

A sheet can declare its own clips, so a scene asks for an animation rather than
tracking frame indices:

```ts
const hero = spritesheet(await loadImage('hero.png'), {
  frame: [16, 24],
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: 6 },
    run:  { frames: [8, 9, 10, 11, 12, 13], fps: 14 },
    jump: { frames: [16], end: ClipEnd.Hold },
  },
});

image(hero.clip('run').at(t), x, y);
```

Sampling is stateless — `at(seconds)` is a pure function of time — so any
number of entities can share one clip without advancing each other, and the
same elapsed time always gives the same frame. Clips end by looping, holding
(what a one-shot needs) or ping-ponging, and a frame held longer is expressed
by repeating it: `[0, 0, 1]` gives frame 0 twice the screen time.

### Several sheets

Loading more than one is normal — tiles, a character, effects. They cannot
share a texture, so **draw order decides the cost**. Measured with three sheets
and 300 sprites:

| Draw order | Draw calls |
| --- | --- |
| Grouped by sheet | 3 |
| Interleaved | 300 |

Group draws by sheet where you can. `app.stats.drawCalls` reports the number
for the last frame.

## Paths

Shapes are built from bezier segments, and the buffer stores the control
points — never a flattened polyline:

```ts
beginShape();
vertex(0, 0);
bezierVertex(70, -40, 140, -60, 200, 0);
bezierVertex(140, 60, 70, 40, 0, 0);
endShape(true);
```

That is what lets SVG export a real `<path d="…">` with curve commands while
the GPU flattens at whatever resolution it is actually drawing. Flattening is
adaptive, derived from a bound on the curve's second derivative.

Fills use the stencil buffer rather than a triangulator: each contour is drawn
as a fan with separate front/back winding, leaving the winding number in the
stencil, and a cover quad paints where it is non-zero. That is the nonzero rule
Canvas2D uses, it handles self-intersection and holes, and it needs no
dependency. The hole scene in the comparison comes out pixel-identical.

## Shaders

Post-processing is a normal feature, not an escape hatch. A pass is only a
`main()` — the runtime supplies `v_uv`, `fragColor`, `u_texture`,
`u_resolution`, `u_time` and a `texelSize()` helper:

```ts
s.setPasses([
  { fragment: `void main() {
      vec4 c = texture(u_texture, v_uv);
      fragColor = vec4(1.0 - c.rgb, c.a);
    }` },
]);
```

Passes run in order, each reading the previous one's output, ping-ponging
between two render targets so an N-pass chain still needs only two textures. An
empty chain allocates no targets at all, so a scene that never asks for effects
pays nothing for them.

## Text

Text is rendered from a signed distance field built at runtime from any font
already on the system — no build step, no atlas file to ship. SDF rather than
MSDF: MSDF holds corners sharp at extreme scale but needs an offline generator,
and the trade is that corners soften well above the atlas resolution.

Reproduce with:

```bash
bun run bench/encode.ts
```

For the GPU bench, run `bun run dev` and open
http://localhost:5199/bench/gpu.html.

## Development

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run build
bun run test
```

Build the packages, then start the Vite development server:

```bash
bun run dev
```

| Page | What it is |
| --- | --- |
| `/` | Landing page |
| `/playground` | Live editor, five starters, SVG export |
| `/reference` | Generated API reference |
| `/examples` | The twelve example scenes |
| `/bench/compare.html` | Backend agreement across WebGL2, Canvas2D and SVG |
| `/bench/gpu.html` | 100k-shape GPU benchmark |
| `/bench/probe.html` | Stencil-through-a-render-pass regression check |
| `/bench/sprites.html` | Sprite orientation, across both image source types |

The reference is generated from the emitted `.d.ts` files rather than by
TypeDoc, which runs on the TypeScript compiler API that TS 7.0 does not
stabilise until 7.1 — the same constraint that keeps linting on oxlint. Rebuild
it with `bun run apps/docs/src/build.ts`.

See [AGENTS.md](AGENTS.md) for conventions, the toolchain rationale, and the
rules that matter.

## License

MIT
