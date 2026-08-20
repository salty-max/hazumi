# AGENTS.md

Guidance for AI agents and new contributors working in this repository.

Matter is a creative-coding library in the p5.js tradition, rebuilt on a typed
core with a WebGL2-first renderer. The full architecture and phased build plan
live in the architecture document; this file covers the rules that are cheap to
state and expensive to violate.

## Commits

- **Never add `Co-Authored-By` trailers.** Write the message and stop at the body.
- Conventional commits, enforced by commitlint on `commit-msg`.
- Scope must come from the list in `commitlint.config.ts`. Adding a package means
  adding its scope there.

```
feat(webgl2): batch instanced circles by pipeline key
fix(math): correct Mat4 inversion for singular matrices
chore(repo): bump turbo
```

## The two rules that must not bend

**1. Tessellation belongs to the backend, never the encoder.**

The command buffer stores high-level primitives — circle at xy with radius r, a
path with these bezier segments, a stroke of width w. It never stores triangles.

Tessellating early is lossy and irreversible. It breaks SVG export, bakes in a
resolution so high-DPI and offline upscaling degrade, and forfeits the analytic
SDF shader path that makes the GPU backend fast in the first place. If you find
yourself producing vertices in `@matter/graphics`, stop — that work belongs in
`@matter/backend-webgl2`.

**2. Layers may not import downward.**

```
L0 core  →  L1 math  →  L2 color  →  L3 graphics  →  L4 backends  →  L5 matter
```

A package may only import from layers above it. `@matter/graphics` must never
import a backend; `@matter/core` must never import anything. Bun's isolated
linker (`bunfig.toml`) enforces this — a package can only resolve what it
declares — so a violation shows up as a resolution failure, not a silent
coupling.

## Layout

| Path | Layer | Role |
| --- | --- | --- |
| `packages/core` | L0 | Lifecycle, clock, plugin registry. Depends on nothing. |
| `packages/math` | L1 | Vec2/Vec3, Mat4, seeded PRNG, noise, easing. Pure. |
| `packages/color` | L2 | OKLCH color type, parsing, interpolation. |
| `packages/graphics` | L3 | Command buffer, paths, style, transforms. |
| `packages/backend-webgl2` | L4 | **Primary renderer.** Most of the engineering. |
| `packages/backend-canvas2d` | L4 | Reference oracle for tests + text fallback. |
| `packages/backend-svg` | L4 | Vector export. |
| `packages/backend-headless` | L4 | Records commands for assertions. |
| `packages/matter` | L5 | Umbrella entry point. Deliberately thin. |
| `packages/vite-plugin` | — | Optional build-time auto-import. |

If something can only be written in `packages/matter`, a lower layer is missing
a capability. Push it down rather than thickening L5.

## Toolchain, and why

Build and lint stay on Oxc; Bun installs, runs scripts, and runs unit tests.

- **Bun** — package manager, script runner, and `bun test` for pure packages.
- **Turborepo** — task graph. `build` depends on `^build`, so packages compile in
  dependency order.
- **tsdown** (Rolldown + Oxc) — library builds and declaration generation.
- **oxlint / oxfmt** — linting and formatting. Note `oxfmt` is pre-1.0.
- **TypeScript 7.0** — the Go-native `tsc`, for typechecking only.

**Do not switch the build to `bun build`.** It still cannot emit `.d.ts`
natively, and the plugins that fill the gap work through the TypeScript compiler
API — which TS 7.0 does not stabilize until 7.1. The same constraint rules out
`typescript-eslint`, which is why linting is on oxlint. Keep build and lint on
the Oxc side and this stays consistent.

## TypeScript conventions

`tsconfig.base.json` sets `isolatedDeclarations` and `erasableSyntaxOnly`. Two
consequences you will hit immediately:

- **Every exported declaration needs an explicit type annotation.** Inferred
  return types on exports are an error. This is what makes Oxc-side declaration
  generation fast and reliable.
- **No `enum`, `namespace`, or parameter properties.** Use a frozen object plus a
  derived type instead — see `Op` in `packages/graphics/src/index.ts` for the
  pattern.

Also on: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`.

## Testing

The split is not a preference — Bun's runtime has no WebGL and its test runner
has no browser mode.

- **`bun test`** for L0–L2 and `backend-headless`. Fast, runs everywhere.
- **Vitest browser mode on Playwright** for `backend-webgl2`. Required for
  anything touching a GL context.

Prefer asserting on the recorded command stream via `backend-headless` over
pixel comparison. Reserve golden-image tests against `backend-canvas2d` for
verifying WebGL2 *correctness*, where pixels are genuinely the thing under test.

## Performance rules for the hot path

These apply to command-buffer encoding and the WebGL2 backend's per-frame work:

- No allocation in the per-frame path. No object literals, no closures, no array
  `map`/`filter` in encode or flush.
- Batches key on program, blend state, and texture — but with alpha blending only
  *adjacent* compatible commands may merge. A global sort silently reorders
  overlapping transparent shapes.
- Every GPU resource is a handle plus a CPU-side descriptor sufficient to rebuild
  it, so `webglcontextlost` is recoverable. Never hold a raw GL object.

## 2D now, 3D later

The library ships 2D. The 3D hedge is paid in exactly three places and nowhere
else: `Mat4` in the transform stack, a real camera abstraction with a UBO layout
sized for perspective, and a framebuffer chain parameterized over its
attachments.

Do **not** pre-emptively add z to the 2D vertex layouts — instanced primitives
stay two-component, because that is the performance path. 3D arrives as new
opcodes and a new batch pipeline, not a restructuring.

## Commands

```bash
bun install          # install workspace deps
bun run build        # turbo run build, in dependency order
bun run typecheck    # tsc --noEmit across packages
bun run test         # bun test
bun run lint         # oxlint
bun run format       # oxfmt
bun run changeset    # record a version bump
```
