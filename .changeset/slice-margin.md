---
"hazumi": minor
---

`findGrid` takes a `margin`, and an even grid drops its empty cells.

Bands find the cells only when the art fills them. On a sheet drawn with slack
inside each cell — a sword floating in an eight-pixel box, its ink starting two
pixels in — the bands drift with the art and every offset comes back a little
wrong: `rows: [3, 8, 17, 25, 32, 40, 48, 56, 64, 73]` where the grid is plainly
`[0, 8, 16, …]`.

No scan can recover that, because the information is not in the pixels. I
prototyped an automatic phase search over the five sample sheets — score each
possible offset by how much ink lands on its cell boundaries, take the best —
and it picks the wrong pixel on two of the five. So the origin is asked for
rather than guessed:

```ts
findGrid(image, { frame: [8, 8], margin: 0 });
```

With a margin and a size the grid is arithmetic, using the same two numbers
`spritesheet` itself takes. Cells with no ink are dropped, so a trailing empty
column or a sparsely used block costs nothing.
