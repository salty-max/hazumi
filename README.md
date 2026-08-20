# Matter

A creative-coding library in the p5.js tradition, rebuilt on a typed core and a
retained command buffer, with WebGL2 as the default renderer rather than the
fallback.

> **Status: pre-alpha.** The workspace is scaffolded; the renderer is not built
> yet. See the build order below.

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
| P1 | Command buffer + minimal instanced WebGL2 path | 100k shapes at 60fps, one draw call, zero steady-state allocation, context loss recovers |
| P2 | core, math, color | Plugin builder infers composed types; math fully covered |
| P3 | Renderer subsystems + Canvas2D oracle | WebGL2 and Canvas2D agree on every primitive |
| P4 | First vertical slice, `0.1.0` | A real p5 sketch ports without an escape hatch |
| P5 | MSDF text, then SVG backend | Every example renders to WebGL2 and exports valid SVG |
| P6 | Docs + playground | A stranger reaches a running sketch without reading source |
| P7 | Breadth: images, user shaders, input, addons | The addon API has been used by someone who didn't write it |

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
