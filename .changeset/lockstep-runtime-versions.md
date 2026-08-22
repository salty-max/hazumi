---
"hazumi": patch
"@hazumi/core": patch
"@hazumi/math": patch
"@hazumi/color": patch
"@hazumi/graphics": patch
"@hazumi/backend-webgl2": patch
"@hazumi/backend-canvas2d": patch
"@hazumi/backend-svg": patch
"@hazumi/backend-headless": patch
"@hazumi/audio": patch
"@hazumi/physics": patch
"@hazumi/vite-plugin": patch
---

Version the runtime packages together.

`hazumi` and `@hazumi/*` now share a version via the changesets `fixed`
group, so a bump in one package releases the whole library at the same
number. `create-hazumi` stays independent.
