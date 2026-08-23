---
"hazumi": minor
---

Declare an animation clip as a row of a sheet.

Slicing a grid sheet into clips meant writing out linear frame indices, which
are not what a sheet looks like: an animation sits on a row, and turning that
row into `[8, 9, 10, 11, 12, 13]` means first working out the column count from
the image size. Every clip then carries that count implicitly, so repacking the
sheet silently points the clips at the wrong frames.

`ClipOptions` now takes `row`, plus `from` and `to` for a slice of it — or a
`from`/`to` run across the sheet when there is no row. The sheet resolves the
run, because the sheet is what knows the grid. `frames` still takes an explicit
list for a clip that repeats or reorders frames; declaring both, declaring
neither, or naming a row or a run that falls outside the sheet throws
`InvalidClipError` when the sheet is built rather than drawing the wrong sprite.
