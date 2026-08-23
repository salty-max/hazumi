---
"@hazumi/backend-webgl2": patch
---

Draw text correctly where the rasteriser reports no derivative.

The glyph shader softened its edge with `smoothstep(-aa, aa, d)`, where `aa` is
`fwidth(d)`. That range is only valid while `aa` is positive, and GLSL leaves
`smoothstep` undefined once `edge0 >= edge1` — so the shader was relying on a
derivative it never checked.

A zero derivative is not hypothetical. Magnifying the atlas makes a software
rasteriser sample the same texel for all four fragments of a 2x2 quad:
measured under SwiftShader, `fwidth` came back as exactly 0 — never negative,
never NaN — on 9128 of 16384 pixels of one glyph. The undefined answer it then
picked was the inverse of the letter, so text rendered as a solid block with
the glyph punched out of it. Every still in `examples/assets/previews` was
captured that way, since those run in headless Chromium.

Both fragment shaders now floor the width at `MIN_AA`, orders of magnitude
below any real derivative, so nothing changes where the derivative is usable
and the degenerate case falls back to a hard edge instead of an undefined one.
