---
"hazumi": minor
---

Make spritesheets and tilemaps say what they mean.

**Names are typed.** `spritesheet(img, { frames: { idle: … } })` hands back a
sheet that knows its own frame names, so `named("idel")` is a compile error
rather than a scene that throws on the frame it first draws. Clip names and
tilemap layer names the same. Sheets stay assignable to a plain `Spritesheet`,
so nothing that takes one has to change.

**Frames are checked against the sheet.** A rectangle that hangs off the edge
used to be accepted in silence and drawn as whatever pixels were there —
visible as a sliver of the neighbouring sprite, not as an error.
`InvalidFrameError` now names the frame and says which edge it runs past and by
how much.

**Grids that are not on one cadence.** `spacing` and `margin` take a pair for
per-axis gaps, `columns` and `rows` take explicit pixel offsets for sheets laid
out in blocks, and a sheet may carry a grid _and_ named rectangles at once. A
name may point at a cell as `[column, row]` instead of arithmetic done by hand,
and it resolves to the very same frame `at()` returns.

**`ninePatch(frame, border)`** builds a stretchable box from one tile. Corners
keep the size they were drawn, only the spans between them grow, and a `scale`
enlarges the border by a whole number so a pixel stays a pixel. CSS-style
shorthand for the sides.

**`findGrid` and `findSprites`** read a sheet and tell you how it is cut:
`findGrid` takes the bands of ink between the gutters and divides each into
whole cells, `findSprites` boxes each island of connected pixels in reading
order. Both take a `region`, because one file usually holds several layouts.
What `findGrid` returns spreads straight into `spritesheet`.

**Tilemaps can be written as pictures.** A layer's `tiles` may be rows of
characters read through a `key` that maps each one to a frame index, a frame
name, or `null` for a gap — and the drawing carries its own size, so `columns`
and `rows` become optional. `set` and `fill` take a frame name too, and
`columnAt` / `rowAt` / `xOf` / `yOf` convert between world and tile coordinates
without every scene rewriting the same division.
