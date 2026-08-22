---
"hazumi": minor
---

Read Aseprite and Tiled exports directly.

Spritesheets could only be described as a grid or as hand-written rectangles,
and tilemaps as a hand-written array. But sprite work arrives as an Aseprite
JSON export and levels arrive from Tiled, so both had to be retyped into source
and kept in step — a copy that goes stale the first time an animation gains a
frame.

`fromAseprite` turns a sheet into named frames and clips. Per-frame durations
become a rate plus repeats, which is the mechanism `ClipOptions` already
documents for holding a frame longer, so 100ms followed by 200ms comes out as
10fps with the second frame twice. Tags become clips, with `pingpong` and
`reverse` handled and a fixed repeat count read as holding on the last frame.

`fromTiled` turns a map into tilemap options, rebasing global ids onto each
tileset's own indices and mapping gid 0 to the empty tile.

Both are pure transforms — no fetching, no images — so they compose with
`loadJson` and the caller supplies a spritesheet per tileset.

They refuse rather than guess where the formats exceed what a tilemap can draw:
a flipped or rotated tile would otherwise be painted the wrong way round, and a
layer mixing two tilesets cannot batch into one run. Object groups are skipped
rather than rejected, since a map legitimately carries them.
