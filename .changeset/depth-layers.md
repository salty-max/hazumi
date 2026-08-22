---
"@hazumi/graphics": minor
"hazumi": minor
---

Order drawing by depth with `layer()`.

Draw order was call order, full stop. That is the right default and it is what
keeps overlapping transparency correct — batching merges only _adjacent_
commands — but it left no way to say a player passes behind a tree, or that a
HUD belongs above everything, without restructuring the scene around the
painter's algorithm.

`layer(depth, body)` overrides call order and only call order: within one depth,
and inside a block, calls still paint in sequence, so sorting entities by y and
drawing them in a loop behaves as written. Unlayered drawing sits at depth 0.

Style and transform are scoped to the block, which is load-bearing rather than
tidy — a layer that leaked a fill would change another layer's colour depending
on which depth sorted first.

The sort happens once, on the buffer, before any backend sees the stream:
`CommandBuffer.reorderSegments` rewrites the recorded words into paint order, so
the stream every backend walks is still a linear list and none of them change.
It is stable, reuses its scratch across frames, and leaves the side tables
alone — strings and images are referenced by index, and moving the words that
hold those indices does not move what they point at.
