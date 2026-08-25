---
"hazumi": patch
"@hazumi/math": patch
"@hazumi/color": patch
"@hazumi/core": patch
"@hazumi/audio": patch
"@hazumi/physics": patch
"@hazumi/backend-webgl2": patch
"@hazumi/backend-canvas2d": patch
"@hazumi/backend-svg": patch
"@hazumi/backend-headless": patch
---

Every member of every exported interface and class is now documented.

The last pass covered exports and stopped there, which left 290 members bare:
`RigidBody.invMass`, `InputState.previousMouseX`, `Tilemap.rowAt`, every
channel of every colour type. On hover they showed a type and nothing else,
which is the point at which a reader goes and opens our source — the thing the
reference exists to prevent.

They say what a type cannot: that `Aabb.minY` is the top edge because y grows
downwards, that `RigidBody.invMass` is zero for a static body and that this is
how "infinitely heavy" is expressed without a special case, that
`Circle.radius` is a radius while `circle()` takes a diameter.

A test now fails the build on any export or member without one, so the
next thing added is documented when it is added rather than in a pass a year
later.
