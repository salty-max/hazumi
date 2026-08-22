---
"hazumi": minor
---

Tween values over time.

Easings lived in `@hazumi/math` but nothing used them: interpolating a value
meant writing the clamp, the normalise and the lerp by hand at every call site.

`tween()` and `sequence()` fill that in, and they are sampled rather than
ticked. `at(seconds)` is a pure function of elapsed time, holding no state and
mutating nothing — the same shape animation clips already use. A tween that
advances itself would have to be owned, updated once a frame, and cleaned up
when whatever it animates disappears; a function of time can be shared by any
number of entities, read out of order, rewound by passing a smaller number, and
costs nothing while nothing is looking at it. It also keeps a scene as
deterministic as its clock.

`sequence()` chains tweens into one, and returns a `Tween` like any other, so
sequences nest. Both reuse `ClipEnd` for what happens at the end, so holding,
looping and ping-ponging mean the same thing here as they do for clips.
