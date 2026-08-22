# @hazumi/color

OKLCH values, parsing, and mixing. Stored and interpolated in OKLCH so blends
stay perceptually even.

From a scene, `oklch` and `rgb` also come from `hazumi/draw`. Use this package
directly when you are mixing or converting outside a draw call:

```ts
import { oklch, parse, mix } from "@hazumi/color";

const fill = oklch(0.72, 0.16, 250);
```

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
