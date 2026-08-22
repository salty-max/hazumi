# @hazumi/physics

Rigid-body plugin host. The solver is `@hazumi/math`'s `physics` world — this
package owns one on the scene and steps it after each fixed update.

```ts
import { createPluginHost, start } from "hazumi/app";
import { physics } from "hazumi/physics";
import { webgl2 } from "hazumi/backends/webgl2";

start({ backend: webgl2(), plugins: createPluginHost().use(physics()) }, ({ physics }) => {
  physics.world.addBox({ x: 200, y: 80, width: 40, height: 28 });
});
```

It does not draw. Outlines belong to `hazumi/debug`.

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
