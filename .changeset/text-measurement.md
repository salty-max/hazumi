---
"@hazumi/backend-canvas2d": minor
"@hazumi/backend-webgl2": minor
"@hazumi/backend-svg": minor
"@hazumi/graphics": minor
"hazumi": minor
---

Measure text, and wrap it.

`measureText`, `textWidth` and `wrapText` in `hazumi/draw`. Until now the API
could draw a string but not ask how wide it was, which left no way to fit a
label to a button, centre a caption, or lay out a dialogue box — the kind of
thing every game needs and no scene could compute for itself.

Measurement belongs to the backend, because only the backend knows the font, so
`Renderer` gains an optional `measureText` returning the new `TextMetrics`
(`width`, `ascent`, `descent`, `lineHeight`). The GPU path sums advances from
the same SDF atlas it draws with, so the number a scene lays out against is the
number that gets drawn; Canvas2D and SVG ask a canvas. All three take `ascent`
and `descent` from a fixed "Hg" sample so they describe the line box rather than
whichever glyphs are in this particular string — and so they agree with each
other. Measured at 20px, WebGL2 and Canvas2D both report 45.6px for "Hello" and
break the same sentence at the same word.

`wrapText` splits on spaces, preserves newlines you wrote, and gives a word
wider than the box its own line rather than cutting it.

A backend with no font context cannot answer, and says so:
`TextMeasurementUnavailableError` rather than a guessed width that would
silently misplace every layout built on it.
