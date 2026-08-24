---
"hazumi": minor
"@hazumi/graphics": minor
"@hazumi/backend-webgl2": minor
---

`Scene.overlay` — drawing that the shader chain does not touch.

Post-processing belongs to the world. Until now it also belonged to everything
drawn on top of it, because the chain runs over the whole frame: a heads-up
display went through the same passes as the scene, so it was dimmed by the
world's lighting, warped by its warp and bloomed by its bloom. A scene lit by a
multiply pass finds this immediately — its caption comes out at a fraction of
the brightness it was drawn with, and there is no layer to move it to.

A scene may now declare `overlay(alpha, ctx)` alongside `draw`. It is a second
command stream, rendered after the chain has presented and straight onto the
canvas. Anything meant for the reader rather than for the world goes there: a
score, a control legend, a debug readout.

`Renderer.render` takes an optional second argument for this, `{ passes: false }`.
A backend with no chain can ignore it — for it every stream is already drawn the
same way — so a scene written this way looks identical on all four.
