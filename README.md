# Matter

A creative-coding library in the p5.js tradition, rebuilt on a typed core and a
retained command buffer, with WebGL2 as the default renderer rather than the
fallback.

> **Status: 0.1.0, pre-alpha.** The drawing API, SDF text, images, shader
> passes and SVG export all work, with eight example sketches running on them.
> Not published to npm — bezier paths and a WebGPU backend are still to come.

## Why

p5.js is excellent and this is not a replacement for it. But its WebGL mode is
its weakest area — sketches that need real GPU throughput tend to leave for
Three.js and lose the friendly API on the way out. Matter aims at that gap:
p5-style ergonomics with a renderer that does not fall over at a hundred
thousand objects, and where shaders are not an escape hatch.

## A sketch

```ts
import { sketch } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

sketch({ backend: webgl2(), width: 600, height: 600 }, () => {
  return ({ background, circle, fill, width, height, t }) => {
    background('oklch(0.15 0.02 260)');
    fill('oklch(0.7 0.18 250)');
    circle(width / 2, height / 2, 200 + Math.sin(t) * 80);
  };
});
```

The context is destructured in the draw callback rather than injected onto
`window`. That recovers nearly all of p5 global mode's terseness while staying
fully typed — and because the same object is mutated in place, reading `t` or
`width` costs nothing per frame.

Style can be scoped instead of pushed and popped:

```ts
with({ fill: 'red', stroke: null }, () => {
  drawPetals();
});
```

It restores on exit *including when the body throws*, which is the failure
`push()`/`pop()` cannot protect you from.

Run `bun run bench/serve.ts` and open
http://localhost:5199/examples/gallery.html to see the five sketches in
`examples/`.

## Design in one page

The user's `draw()` does not paint. It encodes high-level commands — *circle at
xy, radius r* — into a struct-of-arrays typed-array buffer, which a backend then
consumes. Immediate-mode ergonomics on the outside, retained-mode data inside.

Four things fall out of that:

- **Vector export.** SVG is just another buffer consumer.
- **Real unit tests.** The headless backend records the command stream, so tests
  assert on what was drawn instead of pixel-diffing a browser.
- **Deterministic recording.** Seeded RNG plus a decoupled clock means a sketch
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

| Phase | Work | Done when |
| --- | --- | --- |
| P1 ✅ | Command buffer + minimal instanced WebGL2 path | **Met** — see measurements below |
| P2 ✅ | core, math, color | **Met** — 253 tests; plugin types verified at compile time |
| P3 ✅ | Renderer subsystems + Canvas2D oracle | **Met** — 10/10 scenes agree, mean diff ≤ 1.8/255 |
| P4 ✅ | First vertical slice, `0.1.0` | **Met** — five sketches in `examples/`, no escape hatches |
| P5 ✅ | Text, then SVG backend | **Met** — 12 scenes export and rasterise to within 0.31/255 |
| P6 ✅ | Docs + playground | **Met** — landing page, live editor, 184-symbol reference |
| P7 ◐ | Breadth: images, shaders, input, auto-import | Delivered; WebGPU deferred — see below |

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

Canvas2D is the reference renderer. Ten scenes render through both backends and
are compared pixel by pixel — mean per-channel difference over the frame, out
of 255:

| Scene | Mean diff | Draw calls |
| --- | --- | --- |
| filled circles | 0.40 | 1 |
| filled rects | 0.68 | 1 |
| non-square rect strokes | 1.75 | 1 |
| circle strokes | 0.93 | 1 |
| lines | 1.81 | 1 |
| overlapping transparency | 0.36 | 1 |
| interleaved blend modes | 0.59 | 10 |
| transform stack | 0.61 | 1 |
| uniform scale with stroke | 0.62 | 1 |
| push/pop restores style | 0.47 | 1 |

Two independent rasterisers never match bit-for-bit on antialiased edges, so
the bar is "no visible difference", not "identical". The interleaved-blend
scene takes ten draw calls by design: merging non-adjacent instances would
reorder overlapping transparent shapes.

Run it with `bun run bench/serve.ts` and open
http://localhost:5199/compare.html.

SVG is rasterised through the browser and diffed against Canvas2D as well.
Several scenes come out pixel-identical and the worst is 0.31, because both go
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
empty chain allocates no targets at all, so a sketch that never asks for effects
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

For the GPU bench, run `bun run bench/serve.ts` and open http://localhost:5199.

## Development

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run build
bun run test
```

Then serve the repo and open http://localhost:5199:

```bash
bun run bench/serve.ts
```

| Page | What it is |
| --- | --- |
| `/index.html` | Landing page |
| `/apps/playground/index.html` | Live editor, five starters, SVG export |
| `/apps/docs/dist/index.html` | API reference, 184 symbols |
| `/examples/gallery.html` | The six example sketches |
| `/bench/compare.html` | Backend agreement across WebGL2, Canvas2D and SVG |
| `/bench/gpu.html` | 100k-shape GPU benchmark |

The reference is generated from the emitted `.d.ts` files rather than by
TypeDoc, which runs on the TypeScript compiler API that TS 7.0 does not
stabilise until 7.1 — the same constraint that keeps linting on oxlint. Rebuild
it with `bun run apps/docs/src/build.ts`.

See [AGENTS.md](AGENTS.md) for conventions, the toolchain rationale, and the
rules that matter.

## License

MIT
