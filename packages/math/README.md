# @hazumi/math

Vectors, collision queries, grid pathfinding, a rigid-body solver, 4×4
matrices, seeded random, noise, and easing. Pure — no renderer.

From a scene, import `hazumi/math`. The vector modules are namespaced because
the operation names collide:

```ts
import { vec2, collision, pathfind, seeded } from "hazumi/math";

vec2.add(out, a, b);
```

The rigid-body world here is the solver (`world.step(dt)`). The scene plugin
that owns one and steps it for you is `hazumi/physics`.

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
