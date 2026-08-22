---
"hazumi": minor
"@hazumi/graphics": minor
"@hazumi/backend-webgl2": minor
"@hazumi/backend-canvas2d": minor
"@hazumi/backend-svg": minor
"@hazumi/backend-headless": minor
"@hazumi/vite-plugin": patch
---

Add image tint and source-rect crops.

`tint()` / `noTint()` multiply images independently of fill, so distance fog
no longer needs a second shape pass. `image()` accepts an optional source
rectangle, and `sliceFrame()` crops a sprite without fabricating a fake frame.
Scene factories keep the capability-import context across `await`.
