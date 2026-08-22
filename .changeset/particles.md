---
"hazumi": minor
"@hazumi/core": minor
"@hazumi/math": minor
"@hazumi/color": minor
"@hazumi/graphics": minor
"@hazumi/backend-webgl2": minor
"@hazumi/backend-canvas2d": minor
"@hazumi/backend-svg": minor
"@hazumi/backend-headless": minor
"@hazumi/audio": minor
"@hazumi/physics": minor
"@hazumi/vite-plugin": minor
"create-hazumi": patch
---

Add pooled particles and pin the scaffold to the library version.

`particles()` is a fixed-capacity pool. `emit` bursts, `drip` emits at a
rate without allocating a count each frame, and `draw(alpha)` interpolates
from the previous update. Bursts take origin ranges, inherited `vx`/`vy`,
rotation, and spin. The default paint is additive circles, or tinted sprites
when the system or burst has an `image` — pass `Blend.Normal` for dust.
`create-hazumi` no longer pins `hazumi` to its own semver; the generated app
asks for `^0.3.0`.
