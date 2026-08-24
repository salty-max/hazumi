---
"hazumi": patch
---

Stop a particle system leaving the whole scene in additive blending.

`draw` wrapped its pass in `push` / `blendMode` / `pop`. That restores the blend
the backend holds, but not the context's own copy of the style — and the next
frame opens by re-emitting that copy. So one burst of sparks switched every
frame after it to additive, and from then on nothing could paint over anything:
a solid rectangle drawn on top of a starfield let the stars through.

The pass now runs through `with`, which restores both. Nothing about the API
changes, and the overrides object and callback are built once per system rather
than per frame, so a draw still allocates nothing.
