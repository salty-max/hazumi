# Matter

A creative-coding library in the p5.js tradition, rebuilt on a typed core and a
retained command buffer, with WebGL2 as the default renderer rather than the
fallback.

> **Status: 0.1.0, pre-alpha.** The drawing API works and five example sketches
> run on it. Not published to npm — text, paths, and SVG export are still to
> come.

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
| P5 | MSDF text, then SVG backend | Every example renders to WebGL2 and exports valid SVG |
| P6 | Docs + playground | A stranger reaches a running sketch without reading source |
| P7 | Breadth: images, user shaders, input, addons | The addon API has been used by someone who didn't write it |

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

**Known divergence:** stroke width under anisotropic scale. Both backends
scale stroke with the transform, but they distribute it differently; the
comparison scenes use uniform scale only.

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

See [AGENTS.md](AGENTS.md) for conventions, the toolchain rationale, and the
rules that matter.

## License

MIT
