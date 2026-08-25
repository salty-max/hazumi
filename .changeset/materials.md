---
"hazumi": minor
"@hazumi/graphics": minor
"@hazumi/backend-webgl2": minor
"@hazumi/backend-headless": minor
---

Per-sprite materials: `flash`, `outline`, `dissolve`.

```ts
material({ type: "flash", amount: hit / FLASH_FOR });
image(enemy, x, y);
```

The question this answers is one the engine kept saying no to: a shader on one
sprite rather than on the whole frame. A post pass is the frame, and the three
things a game actually wants — a hit flash, a border that separates a unit from
the ground it stands on, a death that eats the sprite away — are none of them
frame-wide.

Saying yes literally, as "your fragment shader here", would have cost more than
it gave. A program per sprite is a draw call per sprite, and batching is the one
performance property this renderer is built around. So the material rides in the
instance data instead: two extra words, a kind and three parameter bytes, which
means sprites wearing different materials still merge into a single draw call.
That is what makes the vocabulary closed — the branch has to be written once, in
the shader — and it is worth the closure. `checks/materials.ts` draws eight
sprites in eight different materials and asserts the frame took one draw call.

The cost is two words on every textured instance whether it wears a material or
not: 44 bytes to 52, an 18% wider upload for sprites and glyphs. Shape instances
are untouched, and no draw-call count changes.

Materials apply to images and to text. `outline` is images only — it works by
sampling neighbouring texels, and a glyph is a distance field rather than pixels
— and it needs a texel of empty space inside the frame to draw into. Only WebGL2
implements them; `capabilities.materials` says so, and a backend without them
draws the sprite plain rather than failing.
