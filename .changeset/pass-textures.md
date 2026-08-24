---
"@hazumi/graphics": minor
"@hazumi/backend-webgl2": minor
---

A shader pass can sample images, not just numbers.

`ShaderPass.textures` binds images to sampler names the pass declares. It is for
what a shader cannot work out from the frame — and the clearest case is light.
A screen-space glow can spread beautifully and has no idea what it is spreading
across: light stops at a wall because of where the wall _is_, and that is in the
map, not in the picture. Hand the pass a light map worked out against the map
and the wall casts a shadow.

Same shape for a palette to look colours up in, a mask, a noise field, a
lookup table.

Pass textures are always filtered, whatever the renderer's `smoothing` is set
to. They are data rather than art: a renderer set to `smoothing: false` for
pixel art would otherwise sample a light map with nearest and hand back a grid
of squares. Draw them at whatever resolution the data deserves and let the
hardware interpolate.

Bound from unit two — zero is the previous pass, one is the scene — and cached
per image, so handing the same one every frame uploads it once.
