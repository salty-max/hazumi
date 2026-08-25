---
"@hazumi/math": minor
---

`vec2.addScaled`, `vec2.moveTowards`, `vec2.reflect`, `vec3.addScaled`.

The composites people write by hand out of two or three calls. `addScaled(a, b,
s)` is `a + b * s` — integration, and the most common vector expression there
is; the two-call version allocates an intermediate nobody keeps. `moveTowards`
lands exactly on its target rather than approaching it forever, which is the
difference from `lerp`. `reflect` mirrors across a unit normal.

They exist because the alternative was chaining, and chaining is the wrong
answer here: it would mean either a wrapper object per step or a class, and a
class costs the property that makes `Vec2` useful — anything with an `x` and a
`y` already is one.
