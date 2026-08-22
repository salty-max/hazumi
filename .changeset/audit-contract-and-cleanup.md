---
"@hazumi/backend-canvas2d": patch
"@hazumi/backend-webgl2": patch
"@hazumi/backend-svg": patch
"@hazumi/graphics": patch
"@hazumi/color": patch
"@hazumi/audio": patch
"hazumi": patch
---

Declare the backend capability contract instead of probing for it.

`Renderer` now carries `setPasses`, `setTime` and `stats` as optional members
beside `readPixels` and `writePixels`, so a backend author can see what
implementing each one unlocks. The runtime still guards at runtime, but the
types it narrows to are derived from the interface rather than restated
alongside it.

`ShaderPass` and `FrameStats` move to `@hazumi/graphics`, where they were
previously declared two and three times over. `hazumi` re-exports both, so
existing imports keep working.

New: `ShaderPassesUnavailableError`, thrown where a bare `Error` used to be when
a scene asks for shader passes on a backend without a shader stage. New:
`toByte` in `@hazumi/color`, the colour quantisation the Canvas2D and SVG
backends had each copied.
