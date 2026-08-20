# Matter

A creative-coding library in the p5.js tradition, rebuilt on a typed core and a
retained command buffer, with WebGL2 as the default renderer rather than the
fallback.

> **Status: pre-alpha.** Phase 1 is complete and measured — the command buffer
> and an instanced WebGL2 circle path both hit their targets. Everything above
> that (the `sketch()` API, styles, transforms) is not built yet.

## Why

p5.js is excellent and this is not a replacement for it. But its WebGL mode is
its weakest area — sketches that need real GPU throughput tend to leave for
Three.js and lose the friendly API on the way out. Matter aims at that gap:
p5-style ergonomics with a renderer that does not fall over at a hundred
thousand objects, and where shaders are not an escape hatch.

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
| P2 | core, math, color | Plugin builder infers composed types; math fully covered |
| P3 | Renderer subsystems + Canvas2D oracle | WebGL2 and Canvas2D agree on every primitive |
| P4 | First vertical slice, `0.1.0` | A real p5 sketch ports without an escape hatch |
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
| Frame time (median) | 7.50 ms (45% of the 16.67 ms budget) |
| Frame time (p95) | 7.80 ms |
| Draw calls per frame | 1 |
| Instance-array growths in steady state | 0 |
| Forced context loss | Recovered without reload, 1 draw call after restore |

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
