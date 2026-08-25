---
"hazumi": minor
---

`pool()` — a fixed set of reusable objects, for the things a game spawns and kills.

Every scene that fires a bullet writes the same three pieces: an array
preallocated at startup, a `live` flag on each entry, and a loop that skips the
dead ones. Starfall wrote it three times — shots, enemies, pickups — about fifty
lines saying nothing about the game.

The particle system has had pooling since the beginning. This is the same idea
for the objects a game defines itself, which is the half that was missing: the
engine had solved the problem for its own objects and left yours to you.

```ts
const shots = pool({ capacity: 120, make: () => ({ x: 0, y: 0, vy: 0 }) });

shots.spawn((shot) => {
  shot.x = player.x;
  shot.y = player.y;
  shot.vy = -600;
});

shots.forEach((shot) => {
  shot.y += shot.vy * dt;
  if (shot.y < 0) shots.kill(shot);
});
```

Liveness is not a field on your object. The pool keeps its live entries at the
front of its own array and swaps the last one into the gap when something dies,
so iterating is a plain run with no test in it and killing costs nothing. The
walk goes backwards, which makes killing during iteration safe — including
killing the object in hand.
