# @hazumi/backend-svg

Vector export. A circle stays a circle — this only works because the command
buffer never tessellates.

```ts
import { toSvg } from "hazumi/backends/svg";

const svg = toSvg(buffer, 600, 600);
```

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
