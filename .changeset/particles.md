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

`particles()` is a fixed-capacity emitter: emit, gravity, drag, colour fade,
and a default circle draw that uses `fillRgba()` so a burst does not parse
colours on the hot path. `create-hazumi` no longer pins `hazumi` to its own
semver — the generated app asks for `^0.3.0`.
