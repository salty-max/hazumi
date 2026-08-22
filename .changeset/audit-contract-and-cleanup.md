---
"@hazumi/backend-canvas2d": minor
"@hazumi/backend-headless": minor
"@hazumi/backend-webgl2": minor
"@hazumi/backend-svg": minor
"@hazumi/graphics": minor
"@hazumi/color": minor
"@hazumi/audio": minor
"@hazumi/core": minor
"@hazumi/math": minor
"hazumi": minor
---

Declare the backend capability contract instead of probing for it.

`Renderer` now carries `setPasses`, `setTime` and `stats` as optional members
beside `readPixels` and `writePixels`, so a backend author can see from the
interface what implementing each one unlocks. Previously the runtime declared
private structural types listing members `Renderer` never mentioned and probed
for them with `typeof`, which made the whole capability contract discoverable
only by reading L5's source. The runtime still guards at runtime — a capability
really is optional — but the types it narrows to are now derived from the
interface rather than restated beside it, so they cannot drift.

`ShaderPass` and `FrameStats` move to `@hazumi/graphics`, which owns the
contract. Both were previously declared more than once — `ShaderPass` three
times over, agreeing only by coincidence of shape. `hazumi` re-exports them, so
existing imports are unaffected.

New exports: `ShaderPassesUnavailableError` from `hazumi`, thrown where a bare
`Error` used to be when a scene asks for shader passes on a backend without a
shader stage; and `toByte` from `@hazumi/color`, the 0-1 to 0-255 quantisation
the Canvas2D and SVG backends had each copied.
