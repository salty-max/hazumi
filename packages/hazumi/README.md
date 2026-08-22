# hazumi

A typed 2D graphics library for sketches, generative work, and games.

Draw with ordinary functions. The same scene can run on WebGL2, export as SVG,
or record commands in a unit test.

```bash
bun create hazumi
```

```ts
import { start } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, circle, fill, oklch } from "hazumi/draw";
import { screen, time } from "hazumi/scene";

start({ backend: webgl2(), width: 600, height: 600 }, () => {
  return {
    draw() {
      background(oklch(0.15, 0.02, 260));
      fill(oklch(0.7, 0.18, 250));
      circle(screen.width / 2, screen.height / 2, 200 + Math.sin(time.elapsed) * 80);
    },
  };
});
```

Import by capability: `hazumi/draw`, `hazumi/input`, `hazumi/scene`,
`hazumi/assets`, `hazumi/audio`, `hazumi/math`, `hazumi/color`. Functions do
the work; live values sit on objects (`screen.width`, `time.elapsed`,
`input.mouseX`).

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
