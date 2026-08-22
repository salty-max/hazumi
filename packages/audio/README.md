# @hazumi/audio

Web Audio plugin: load, play, gain, pooled voices.

```ts
import { createPluginHost, start } from "hazumi/app";
import { audio } from "hazumi/audio";
import { webgl2 } from "hazumi/backends/webgl2";

start({ backend: webgl2(), plugins: createPluginHost().use(audio()) }, ({ audio }) => {
  // load / play from the scene context
});
```

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
