# @hazumi/vite-plugin

Optional build-time auto-import. Scene files named `*.scene.ts` can omit
capability imports; the plugin inserts them for the names they use.

```bash
bun create hazumi --auto-import
```

```ts
import { hazumiAutoImport } from "@hazumi/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [hazumiAutoImport()],
});
```

The usual way to get this is `create-hazumi --auto-import`. Most projects
should import from `hazumi/draw` explicitly instead.

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
