# @hazumi/backend-webgl2

Primary renderer: instanced SDF primitives, batched by pipeline.

```ts
import { start } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";

start({ backend: webgl2(), width: 600, height: 600 }, () => {
  return { draw() {} };
});
```

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
