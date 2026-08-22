# @hazumi/backend-headless

Records the command stream instead of rendering it, so tests assert on what
was drawn.

```ts
import { record, recordCircles } from "hazumi/backends/headless";

const commands = record(buffer);
const circles = recordCircles(buffer);
```

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
