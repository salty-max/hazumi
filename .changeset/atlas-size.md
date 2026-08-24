---
"@hazumi/backend-webgl2": minor
---

Let a scene choose how large the glyph atlas is rasterised.

`AtlasOptions` was exported as a type with nothing able to accept one: the
renderer always built its atlas at the default 48 pixels. `webgl2({ text: { … } })`
now reaches it.

It matters more than it sounds. A distance field carries the edge to the
precision of the raster it was measured from, so a glyph drawn far above the
atlas size steps a texel at a time down every diagonal. Measured on a 210-pixel
"A" — the deviation of its left edge from a straight line, in pixels:

| atlas        | RMS off the line |
| ------------ | ---------------- |
| 48 (default) | 0.98             |
| 96           | 0.48             |
| 128          | 0.35             |
| 200          | 0.22             |

It halves as the atlas doubles, which is the signature of texel quantisation
rather than of anything in the shader. The default stays 48, because it is
right for body text and headings and the texture grows with the square of the
size; a title card, a logotype or a specimen sheet should raise it and pay for
the larger texture.
