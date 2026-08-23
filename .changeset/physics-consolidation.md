---
"@hazumi/math": minor
"@hazumi/physics": minor
"hazumi": minor
---

Joints, world queries, and a broad phase that stops being quadratic.

**Joints.** `addDistanceJoint` holds two anchors a fixed distance apart — a rod,
or a rope pulled taut — and `addPinJoint` holds them at the same point while
leaving rotation free. Either can tie two bodies together or pin one to a point
in the world. Anchors are local to each body and default to its centre.
`removeJoint` cuts one, removing a body takes its joints with it, and joints
join sleep islands so a rope sleeps and wakes as one piece.

**Queries against the world.** `raycast` returns the nearest body a ray meets
and writes the point, normal and distance into a `RayHit` the caller owns, so a
shot costs no allocation; `ignore` skips whatever fired it. `pointQuery` returns
the body under a point, latest first, which is what picking wants. Both find
sleeping bodies — sleeping is a shortcut the solver takes, not invisibility.
Until now a ray could only be cast against loose AABBs, never against the
bodies actually in the world.

**Sweep and prune.** Pairs were found by testing every body against every other,
which is fine for a handful and quadratic after that. Sorting on one axis and
walking forward only while intervals overlap makes the cost grow with the number
of bodies instead: 1200 spread-out bodies went from 1.30 ms a step to 0.11 ms,
and 600 from 0.31 ms to 0.05 ms. Body bounds are also computed once per step
rather than recomputing two cosines and two sines inside every pair test.

Pairs now carry a stable A/B identity taken from creation order. The sweep
visits them in whatever order it reaches them, and a contact whose two bodies
had swapped places matched no warm-start entry, leaving the solver to
rediscover every accumulated impulse from nothing — a heap of 80 boxes took
until frame 417 to settle instead of 175, and 160 never settled at all.

Joint length is restored by a position pass that runs four times a step. Once
is not enough: the velocity solve only removes relative motion along the joint,
so a chain struck side-on sat 1.5% long and stayed there while it swung.
Measured residual after ten seconds — one pass 1.5%, four passes 0.23% — and
the pendulum's worst anchor drift fell from 1.13 units to 0.22 with it.

`world.joints` lists the constraints, and the debug overlay draws them.
