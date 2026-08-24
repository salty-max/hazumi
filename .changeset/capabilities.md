---
"hazumi": minor
"@hazumi/graphics": minor
---

`capabilities` — a scene can ask what its backend can do.

Not every backend can run a shader over the frame, hand back its own pixels, or
measure a line of text: the SVG exporter has no raster to read, and the headless
recorder has no font to measure against. That was already the shape of the
contract — optional members on `Renderer` — but only the runtime could see it.
A scene found out by calling and being thrown at, which is fine for a mistake
and no use at all for a decision.

```ts
import { capabilities, setPasses } from "hazumi/scene";

if (capabilities.shaders) setPasses([{ fragment: GRADE }]);
```

Three flags — `shaders`, `pixels`, `text` — derived from what the backend
implements, using the same tests the runtime already used to decide whether to
throw. So a scene that checks and skips is right to skip, and one that calls
anyway still gets the error it always got.

This is what makes a feature that only some backends can offer a reasonable
thing to add at all. A scene stops being "the same picture everywhere" and
becomes "the same scene, asking for what it can have" — the dungeon and the
raycaster now light themselves where a shader is available and draw plainly
where it is not, instead of failing.
