# AGENTS.md

Guidance for AI agents and new contributors working in this repository.

Hazumi is a typed 2D graphics library built on a retained command buffer, with
a WebGL2-first renderer. Current state, remaining gaps, and deferred work live
in [ROADMAP.md](ROADMAP.md). This file covers the rules that are cheap to state
and expensive to violate.

## Public API

Scenes are applications with a Pico-8-shaped loop: a factory (init, may be
async), optional `update(fixedDt)`, required `draw(alpha)`, optional `dispose`.
`start()` always drains the fixed-step accumulator so a scene without `update`
cannot leave a simulation debt for the next one.

New scene code imports by capability. Do not unpack drawing or input functions
from the factory context every frame.

```
import { start } from "hazumi/app";
import { background, circle, fill, scoped } from "hazumi/draw";
import { keyIsDown, keyJustPressed } from "hazumi/input";
import { camera, screen, time } from "hazumi/scene";
import { loadImage, spritesheet, tilemap } from "hazumi/assets";
```

Those functions resolve to the application whose lifecycle callback is running.
They work in `update` / `draw` / `dispose`, and in the factory until the first
`await`. After an `await`, use the factory's context argument for app-owned
plugin services such as `audio`; the returned callbacks can use the imports
again. Calling a capability import with no active scene throws
`NoActiveSceneError`.

The context object remains the implementation those modules read, and the place
plugins attach. It is not the scene-author API.

Live values are getters on objects (`screen.width`, `time.elapsed`,
`input.mouseX`), not p5-style bare `width` / `t` / `pmouseX`. Style scoping is
`scoped()`, not `with()`.

The optional Vite plugin auto-imports those capability modules into `*.scene.ts`
files. It does not destructure the context and it does not invent aliases for
the old names.

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

### Self-review before every commit

`bun run build && bun run typecheck && bun run test && bun run lint` passing is
the floor, not the review. Green checks say the code compiles; they say nothing
about whether it is correct or whether the tests cover the risk. Before staging,
read the actual diff and work the list below.

**Exports** — is every new value exported as a _value_? A class or function
re-exported through `export type` disappears at runtime while still
typechecking, so `bun run build` and `tsc` both stay green and the failure only
shows up when someone imports it. Check the umbrella package too: adding to
`@hazumi/graphics` does not add to `hazumi`, and adding to `hazumi` does not add
to `hazumi/draw`. Import from the built subpath and confirm.

**Resource lifecycle** — does anything that acquires a GPU object have a path
that releases it? `dispose()`, double-`realize()`, and context loss are three
different paths and each needs its own answer.

**Silent-failure defaults** — would forgetting to call this leave a blank canvas
rather than an error? Prefer a working default over a zero value that renders
nothing.

**Format invariants** — if the change touches opcodes or buffer layout, is the
new width pinned by a test? A mismatch between an encoder method and `OP_SIZE`
desyncs the whole stream and no type checks it.

**Test honesty** — do the tests exercise the failure, or only the happy path? An
exported error type with no test asserting it throws is not covered. Grep for
the module name to find what is untested, then confirm a test actually imports
it — matching the word is not the same as covering the file.

**Fixtures that can express the failure** — a test only covers what its fixture
can distinguish. The spritesheet comparison scene drew flat-coloured quadrants,
so a cell rendered upside down sampled the same colour everywhere and diffed at
**0.00** while every sprite in the library was vertically flipped; with an
asymmetric marker the same bug diffs at 113. Before trusting a green check, ask
what the fixture would look like if the code were wrong — if the answer is
"the same", the fixture is the thing to fix, not the assertion.

**Behaviour that varies by input type** — the same GL call can behave
differently depending on what it is handed. `UNPACK_FLIP_Y_WEBGL` is honoured
for a canvas and an `<img>` and silently ignored for an `ImageBitmap`, so image
orientation depended on how the caller decoded the picture, and testing one
source type "proved" a path that was broken for the other. Where a platform API
takes a union, test each member of the union, not the convenient one.

**Unbounded growth** — does anything cache, append, or retain per frame? A Map
keyed by a value the scene computes will grow for as long as the scene runs.
Ask what happens after an hour, not after one frame.

**Measurement honesty** — if the commit quotes numbers, do the benchmarks
actually measure the same workload they claim, and does the message describe
everything in the diff rather than just the interesting part?

**Staging** — `git status` before every commit, and `git show --stat` after. A
commit rejected by commitlint leaves its files staged, so the next `git add`
sweeps them into an unrelated commit.

**No suppressions** — `oxlint-disable`, `@ts-ignore` and friends are not
allowed in this repo. A warning is either a real problem, in which case fix it,
or the code wants restructuring so the rule stops firing. Every suppression
this repo has carried turned out to be the second: sequential awaits became a
promise chain, `new Function` became a module import that also gave user code
real stack traces. The one exception is `no-console` for `bench/`, `examples/`
and the docs build script, which are programs whose output _is_ the product;
it is scoped in `.oxlintrc.json` rather than sprinkled through the source.

**Benchmark contamination** — never read `process.memoryUsage()` inside or
before a timed region. In Bun it makes the following loop roughly five times
slower, which is enough to turn a 0.95ms frame into 4.9ms and look exactly like
a performance regression. Time in one pass, measure allocation in another.

**Stale example bundles** — `examples/dist/*.js` and `bench/dist/*.js` inline
the packages at build time, so `bun run build` alone does not update them. A
page will keep demonstrating the bug you just fixed until its bundle is rebuilt.
Rebuild the bundle before concluding a fix did not work.

**Stale console buffers** — the browser console keeps messages across
navigations, so a warning you already fixed will keep appearing in a tab that
saw it once. Confirm in a fresh tab before chasing it.

Fix what the review finds before committing, not after.

## The two rules that must not bend

**1. Tessellation belongs to the backend, never the encoder.**

The command buffer stores high-level primitives — circle at xy with radius r, a
path with these bezier segments, a stroke of width w. It never stores triangles.

Tessellating early is lossy and irreversible. It breaks SVG export, bakes in a
resolution so high-DPI and offline upscaling degrade, and forfeits the analytic
SDF shader path that makes the GPU backend fast in the first place. If you find
yourself producing vertices in `@hazumi/graphics`, stop — that work belongs in
`@hazumi/backend-webgl2`.

**2. Layers may not import downward.**

```
L0 core  →  L1 math  →  L2 color  →  L3 graphics  →  L4 backends  →  L5 hazumi
```

A package may only import from layers above it. `@hazumi/graphics` must never
import a backend; `@hazumi/core` must never import anything. Bun's isolated
linker (`bunfig.toml`) enforces this — a package can only resolve what it
declares — so a violation shows up as a resolution failure, not a silent
coupling.

`@hazumi/audio` sits beside the stack: it depends only on core, and Hazumi
loads it as a typed plugin. It is not a renderer and it is not L5.

`@hazumi/physics` is the same shape for rigid bodies: it depends on core and
math, owns a world on the scene context, and steps it on the **fixed** clock
via `postupdate`. The solver itself stays in `@hazumi/math`. Drawing debug
outlines is the overlay plugin in L5, because that encodes commands.

## Layout

| Path                        | Layer | Role                                                            |
| --------------------------- | ----- | --------------------------------------------------------------- |
| `packages/core`             | L0    | Clock, plugin host. Depends on nothing.                         |
| `packages/math`             | L1    | Vec/Mat4, RNG, noise, easing, collision, A*, rigid-body solver. |
| `packages/color`            | L2    | OKLCH colour type, parsing, interpolation.                      |
| `packages/graphics`         | L3    | Command buffer, paths, style, transforms.                       |
| `packages/backend-webgl2`   | L4    | **Primary renderer.** Most of the engineering.                  |
| `packages/backend-canvas2d` | L4    | Reference oracle for tests + text fallback.                     |
| `packages/backend-svg`      | L4    | Vector export.                                                  |
| `packages/backend-headless` | L4    | Records commands for assertions.                                |
| `packages/audio`            | —     | Optional Web Audio plugin. Depends on core only.                |
| `packages/physics`          | —     | Optional rigid-body host. Depends on core + math.               |
| `packages/hazumi`           | L5    | Application runtime: `start()`, scenes, input, camera, pixels.  |
| `packages/vite-plugin`      | —     | Optional build-time auto-import of capability modules.          |
| `packages/create-hazumi`    | —     | Project wizard: `npm create hazumi`. Not a layer.               |

L5 is the runtime, not a thin re-export bag. The loop, input, camera, pixels,
tilemaps, and capability bridges live here because they need a canvas and a
clock. Math, colour, and tessellation do not — if something can only be written
in `packages/hazumi` and it is one of those, a lower layer is missing a
capability. Push it down.

## Toolchain, and why

Build and lint stay on Oxc; Bun installs, runs scripts, and runs unit tests.

- **Bun** — package manager, script runner, and `bun test` for packages.
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
  derived type instead — see `Op` in `packages/graphics/src/op.ts` for the
  pattern.

Also on: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`.

## Testing

The split is not a preference — Bun's runtime has no WebGL and its test runner
has no browser mode.

- **`bun test`** for every package, including CPU-side WebGL2 layout and pixel
  conversion, Hazumi's mocked-DOM application loop, and the audio plugin's
  mocked Web Audio graph.
- **Backend agreement** is `bench/compare.html`, not a unit test. Reserve pixel
  comparison against `backend-canvas2d` for verifying WebGL2 _correctness_,
  where pixels are genuinely the thing under test.

Prefer asserting on the recorded command stream via `backend-headless` over
pixel comparison.

## Performance rules for the hot path

These apply to command-buffer encoding and the WebGL2 backend's per-frame work:

- No allocation in the per-frame path. No object literals, no closures, no array
  `map`/`filter` in encode or flush.
- Batches key on program, blend state, and texture — but with alpha blending only
  _adjacent_ compatible commands may merge. A global sort silently reorders
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
bun run test         # bun test via turbo
bun run lint         # oxlint
bun run format       # oxfmt
bun run format:check # oxfmt --check (husky pre-commit)
bun run ci           # format, lint, typecheck, test, build — same as GitHub Actions
bun run changeset    # record a version bump
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) is the merge gate. It installs with
`--frozen-lockfile`, then runs `bun run ci`. Pull requests also lint the commit
range and run `changeset status --since` the base SHA, so a package change
without a changeset fails. A change that must not bump versions takes
`changeset --empty`.

`hazumi#typecheck` waits on that package's own `build`: its subpath-export
tests import `hazumi/app` and friends, which resolve through `dist/`.

Do not add WebGL or pixel-comparison jobs: GitHub-hosted runners have no GPU,
and backend agreement stays `bench/compare.html`. `test:browser` is reserved
until a package actually ships Playwright tests.
