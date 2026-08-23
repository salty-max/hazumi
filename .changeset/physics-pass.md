---
"@hazumi/math": minor
"hazumi": minor
---

Make the rigid-body solver hold up: stacking, fast bodies, damping and sleeping.

**Contacts are now resolved before the step moves anything.** The world used to
integrate positions, then detect, then solve — so every impulse corrected a
frame that had already been drawn. A six-box stack settled 65 units from where
it was built with a crate turned upside down; it now ends 0.3 units off, and a
settled pile costs less than half what it did because nothing churns.

**A fast body can no longer cross something thin.** Contacts are found before
the shapes touch, out to the distance the pair can close in one step, and the
constraint lets them close exactly that much and no more. A 4-unit circle
thrown at 6000 units a second used to pass straight through a 10-unit wall at
any speed above 600; it now stops at the surface. Resting penetration dropped
with it, because a body is held at the surface rather than pushed back out of
it afterwards.

**Restitution reads the impact speed before gravity is added**, so a bounce
returns the height the coefficient predicts — 0.644 of the drop at e = 0.8,
against 0.622 when this step's gravity was counted as part of the impact.

**New: damping.** `linearDamping` and `angularDamping` on a body, or on the
world as the default every new body starts with. Both are rates per second and
both default to 0, which is the behaviour up to now.

**New: sleeping.** A body that stays still stops being simulated, and
`body.isAwake` says so. Sleeping is decided per island, not per body, so a
crate at the bottom of a stack cannot settle under one still rocking above it.
An impulse, a force, something arriving, or a neighbour being removed all wake
it, and `world.wake(body)` is the manual door. A settled pile of 60 boxes went
from 0.265 ms a step to 0.008. The debug overlay dims sleeping bodies and
reports how many are awake.

Friction now combines across a pair as the geometric mean rather than the
larger of the two, so a body given `friction: 0` slides on a grippy floor
instead of silently inheriting its grip.

Sleeping zeroes velocity, so a body read after it has settled reports `vy` of
exactly 0 rather than a residual.
