# create-hazumi

Scaffold a Vite + Hazumi project.

```bash
bun create hazumi
bun create hazumi my-game --template game
```

The wizard asks for a name and whether you want a sketch (`draw`) or a game
(`update` + `draw`). `vite build` writes a static `dist/` you can zip for
itch.io or GitHub Pages.

```
-t, --template <sketch|game>  Skip the kind question
-y, --yes                     Skip the wizard; use defaults
    --local                   Depend on this repo's packages via file:
    --auto-import             Use *.scene.ts + the Vite auto-import plugin
    --no-install              Do not install dependencies
```

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
