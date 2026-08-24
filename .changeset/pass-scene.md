---
"@hazumi/backend-webgl2": minor
---

Give every shader pass the scene it started from, as `u_scene`.

A pass could only ever see the pass before it, which quietly rules out the two
effects people reach for post-processing to get: a bloom is the blurred bright
parts added _back over the frame_, and a light map is the blurred lights
_multiplied into_ it. Both need the original alongside a processed version of
it, and by the time the processed version exists the original is gone. The
bloom example in the gallery is a bloom in name only for exactly this reason —
it can show you the haloes but not the picture they belong to.

The scene now renders into a target of its own instead of into one of the
ping-pong pair, so it survives however long the chain is, and every pass gets it
bound as `u_scene` whether or not it declares it. In the first pass it is the
same image as `u_texture`, so a one-pass chain never has to know the difference.

Costs one texture the size of the canvas, allocated only when a chain is
present.
