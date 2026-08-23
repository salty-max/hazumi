# Hazumi

A typed 2D graphics library for sketches, generative work, and games.

Draw with ordinary functions. The same scene can run on WebGL2, export as SVG,
or record commands in a unit test. Colour is OKLCH. Input, a camera, sprites,
paths, text, physics, and audio are all there.

> Published on npm as `hazumi`. Runtime packages share one version.

## Start a project

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app)

```bash
bun create hazumi
```

The wizard asks for a name and whether you want a sketch (`draw`) or a game
(`update` + `draw`). `vite build` writes a static `dist/` you can zip for
itch.io or GitHub Pages.

## A scene

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
`hazumi/assets`, `hazumi/particles`, `hazumi/audio`, `hazumi/math`,
`hazumi/color`. Functions do the work; live values sit on objects
(`screen.width`, `time.elapsed`, `input.mouseX`). They resolve to the
application that is currently running.

The scene factory still receives the context, which is where plugin APIs such
as `audio` live. Capability imports stay live for the whole factory, including
code after an `await`.

Pass `--auto-import` to `create-hazumi` for `*.scene.ts` files that skip the
capability imports. The Vite plugin inserts them at build time.

Colours are values: `oklch(l, c, h)` or `rgb(r, g, b)`. A CSS string still
parses if you paste one.

Style can be scoped instead of pushed and popped. It restores even if the body
throws:

```ts
scoped({ fill: oklch(0.65, 0.22, 20), stroke: null }, () => {
  drawPetals();
});
```

## A game

Split simulation from drawing. `update` runs at a fixed step; `draw` follows
the display and receives an interpolation alpha:

```ts
import { background, circle, fill, oklch } from "hazumi/draw";
import { keyIsDown, keyJustPressed } from "hazumi/input";

start({ backend: webgl2(), clock: { fixedStep: 1 / 60 } }, () => {
  let previousX = 100;
  let x = 100;

  return {
    update(dt) {
      previousX = x;
      if (keyIsDown("ArrowRight")) x += 120 * dt;
      if (keyJustPressed(" ")) jump();
    },
    draw(alpha) {
      background(oklch(0.12, 0.02, 260));
      fill(oklch(0.7, 0.12, 250));
      circle(previousX + (x - previousX) * alpha, 300, 32);
    },
  };
});
```

Catch-up is capped, so a backgrounded tab cannot pile up unbounded simulation
steps. Override `clock.maxDelta` and `clock.maxFixedSteps` if you need
different limits.

## Input

`keyJustPressed`, `keyJustReleased`, `pointerJustPressed`, and
`pointerJustReleased` last for one fixed update. A tap that finishes between
updates still reports both edges; key repeat does not. `pointers` is mouse,
pen, and every current touch, in logical canvas coordinates. A released
contact stays in the list for that update so its last position is available.
`wheelX` / `wheelY` accumulate once per update, in CSS pixels.

`mouseX`, `mouseY`, `mouseIsPressed`, `mouseJustPressed`, and
`mouseJustReleased` alias the primary pointer.

Gamepads are polled at the start of each fixed update: `gamepads` for axes and
analog buttons, plus `gamepadButtonIsDown` / `JustPressed` / `JustReleased`.
Disconnecting a held pad reports release edges before it leaves the list.

## Camera

Every scene has a camera. Its position is the world point shown at the centre
of the canvas:

```ts
import { background, circle, oklch, text } from "hazumi/draw";
import { camera } from "hazumi/scene";

return {
  update(dt) {
    movePlayer(dt);
    camera.follow(player.x, player.y, 0.12);
    camera.setZoom(2);
  },
  draw(alpha) {
    background(oklch(0.12, 0.02, 260));
    circle(player.x, player.y, 32);

    camera.screen(() => {
      text("HP 100", 16, 24);
    });
  },
};
```

`background` always covers the screen. `camera.screen()` draws HUD in canvas
coordinates. `screenToWorld()` and `worldToScreen()` convert pointer and world
points; both take an optional output object.

## Loading

Scene factories are async, so loading is just `await` — no preload phase, no
manifest, no loader object to carry around:

```ts
const [sheet, level] = await Promise.all([
  loadImage("hero.png"),
  loadJson<LevelData>("level-1.json"),
]);
await loadFont("Departure Mono", "departure.woff2");
```

`loadImage`, `loadText`, `loadJson` and `loadFont`. Text drawing has always used
whatever fonts the system already had; `loadFont` is how a game ships its own —
await it before `textFont()` looks for the family.

Failures throw `AssetLoadError` carrying the URL and, where the request
completed, the status: a 404 and a dropped connection are different problems and
read differently. Loading is uncached on purpose — the browser already caches
the bytes, and a module-level map keyed by URL would hold every asset any scene
ever touched for the life of the page.

## Sprites

```ts
const sheet = spritesheet(await loadImage("tiles.png"), { frame: [16, 16] });
image(sheet.at(3, 1), x, y);
```

`image()` takes a frame wherever it takes an image. Frames are reused by
reference, so asking for the same cell every frame allocates nothing. Indices
wrap, so `frame(t)` loops.

Clips live on the sheet:

```ts
const hero = spritesheet(await loadImage("hero.png"), {
  frame: [16, 24],
  clips: {
    idle: { row: 0, fps: 6 },
    run: { row: 1, fps: 14 },
    attack: { row: 2, from: 1, to: 4, end: ClipEnd.Hold },
    jump: { frames: [16], end: ClipEnd.Hold },
  },
});

image(hero.clip("run").at(time.elapsed), x, y);
```

A grid sheet almost always puts one animation on a row, so a clip can say which
row it is instead of listing indices. The sheet resolves that, because the row
only becomes indices once the column count is known — and that is a number the
caller would otherwise compute from the image size and rewrite the day the sheet
is repacked. `from` and `to` are inclusive and count within the row, or across
the whole sheet when there is no row. `frames` still takes an explicit list,
which is what an out-of-order or a repeating clip needs; declaring both is
refused, as is a row or a run that falls outside the sheet.

`at(seconds)` is a pure function of time. Several entities can share a clip.
Clips loop, hold, or ping-pong; repeat a frame index to hold it longer.

Batching follows draw order. Sprites from one sheet drawn together are one
draw call; mixing sheets costs one call per switch. `app.stats.drawCalls`
reports the last frame.

### From Aseprite and Tiled

Sprite work arrives as an Aseprite export and levels as a Tiled one, so both
read directly rather than being retyped into source — a copy that goes stale the
first time an animation gains a frame:

```ts
const hero = spritesheet(
  await loadImage("hero.png"),
  fromAseprite(await loadJson<AsepriteSheet>("hero.json")),
);
hero.clip("run");

const level = tilemap(fromTiled(await loadJson<TiledMap>("level-1.tmj"), { terrain }));
```

Both are pure transforms: they fetch nothing and hold no images, so the caller
decides how assets load and supplies a sheet per tileset.

Aseprite's per-frame durations become a rate plus repeats — the mechanism clips
already use to hold a frame longer — so 100ms then 200ms comes out as 10fps with
the second frame twice. Tags become clips, with `pingpong` and `reverse` handled
and a fixed repeat count read as holding.

The Tiled importer covers the common export: CSV tile layers, one tileset per
layer. A flipped tile is refused rather than drawn the wrong way round, and a
layer mixing two tilesets is refused because one texture per layer is what lets
it batch. Object groups are skipped, not rejected.

## Tilemaps

```ts
const world = tilemap({
  columns: 64,
  rows: 32,
  tileWidth: 16,
  tileHeight: 16,
  layers: [
    { name: "ground", sheet, tiles: groundTiles },
    { name: "detail", sheet, tiles: detailTiles },
  ],
});

return {
  update() {
    camera.follow(player.x, player.y, 0.12);
  },
  draw() {
    world.draw();
  },
};
```

Use `EMPTY_TILE` for gaps. `world.layer("detail").set(x, y, frame)` edits a
cell in place. Invalid frame indices throw.

## Paths

```ts
beginShape();
vertex(0, 0);
bezierVertex(70, -40, 140, -60, 200, 0);
bezierVertex(140, 60, 70, 40, 0, 0);
endShape(true);
```

SVG export keeps the curves as curve commands.

## Text

```ts
textFont("Georgia");
textSize(24);
text("hello", 16, 32);
```

Uses fonts already on the system. Size and font persist across frames until
you change them.

Laying text out needs to know how wide it is, and only the renderer knows the
font — so measurement goes through the backend:

```ts
const { width, ascent, descent, lineHeight } = measureText("Hello");

for (const [i, line] of wrapText(speech, 380).entries()) {
  text(line, 20, 40 + i * lineHeight);
}
```

`wrapText` breaks on spaces, keeps the newlines you wrote, and gives a word
wider than the box its own line rather than cutting characters off it.

The GPU path sums advances from the same SDF atlas it draws with, so the number
you lay out against is the number that gets drawn. Measured against Canvas2D's
native `measureText` at 20px: both report a 45.6px "Hello" and wrap a sentence
at the same word. The backends without a font context — the headless recorder —
throw `TextMeasurementUnavailableError` rather than guessing a width that would
silently misplace everything built on it.

## Tweening

Interpolation is sampled, not ticked — `at(seconds)` is a pure function of
elapsed time, exactly like an animation clip:

```ts
const fade = tween({ from: 0, to: 1, duration: 0.4, ease: easing.quadOut });
fill(withAlpha(colour, fade.at(time.elapsed - startedAt)));
```

That is the whole design. A tween that advances itself has to be owned, updated
once a frame, and cleaned up when whatever it animated goes away. A function of
time can be shared by any number of entities, read out of order, and rewound by
passing a smaller number — and it costs nothing while nothing is looking at it.

`sequence()` chains tweens into one, and the result is a `Tween` like any other,
so sequences nest. Both end by holding, looping or ping-ponging, using the same
`ClipEnd` vocabulary as clips.

## Depth

Draw order is call order, which is the simplest rule and the right default.
When it is not enough — a player who should pass behind a tree, a HUD that
belongs above everything — `layer()` overrides it:

```ts
layer(0, () => drawGround());
layer(1, () => {
  for (const entity of sortedByY) drawEntity(entity);
});
layer(10, () => drawHud());
```

Lower depths paint first. Depth overrides _only_ call order: within one depth,
and inside a block, calls still paint in the order they were made, so the
y-sort above behaves exactly as written. Anything drawn outside a layer sits at
depth 0.

Style and transform are scoped to the block. That is load-bearing rather than
tidy: a layer that leaked a fill would change another layer's colour depending
on which depth happened to sort first.

The reordering happens once, on the buffer, before any backend sees the stream
— batching merges only adjacent commands, so the order has to be settled before
then, and afterwards every backend is unchanged.

## Shaders

A pass is a `main()`. The runtime provides `v_uv`, `fragColor`, `u_texture`,
`u_resolution`, `u_time`, and `texelSize()`:

```ts
setPasses([
  {
    fragment: `void main() {
      vec4 c = texture(u_texture, v_uv);
      fragColor = vec4(1.0 - c.rgb, c.a);
    }`,
  },
]);
```

Passes run in order. A scene that never sets any allocates nothing for them.

## Canvas size and pixels

`resize()` changes the logical size and the backing store together. `width`,
`height`, and `pixelRatio` are on the context. If you do not pin a ratio in
`start()`, moving between displays updates the backing store.

```ts
const app = start({ backend: webgl2(), width: 320, height: 180 }, scene);
await app.ready;

app.resize(640, 360);
const pixels = app.loadPixels();
pixels.set(0, 0, [255, 0, 255, 255]);
app.updatePixels(pixels);

const png = await app.capturePng();
```

`Pixels.get()` and `set()` address physical pixels. SVG and headless throw
`PixelAccessUnavailableError`.

## Collision

```ts
import { collision, vec2 } from "hazumi/math";

const hit = collision.sweepAabb(collision.aabb(x, y, 24, 24), vec2.vec2(vx * dt, vy * dt), wall);

if (hit) {
  x += vx * dt * hit.time;
  y += vy * dt * hit.time;
}
```

Point containment, AABB/circle overlap, raycasts, and circle sweeps use the
same names. `createRayHit()` and `createSweepHit()` give reusable results.

`slideAabb` moves against a list of solid AABBs one axis at a time, and skips
`null` holes:

```ts
const out = { x: 0, y: 0 };
collision.slideAabb(player, vx * dt, vy * dt, walls, out);
player.x += out.x;
player.y += out.y;
```

## Pathfinding

A cost grid, separate from a tilemap. `0` is blocked, `1` is a normal step:

```ts
import { pathfind } from "hazumi/math";

const map = pathfind.grid(32, 18);
map.set(4, 5, 0);
const path = pathfind.createPath();
pathfind.astar(map, 1, 1, 30, 16, { out: path });
```

Returns cell coordinates from start through goal, or `null`. `{ diagonal: true }`
allows 8-direction movement without cutting a blocked corner. Reuse the grid
and the path.

## Physics

Circles and oriented boxes, with restitution and friction. The usual way to
run it is the plugin, which steps after each fixed update:

```ts
import { createPluginHost, start } from "hazumi/app";
import { overlay } from "hazumi/debug";
import { physics } from "hazumi/physics";

start(
  {
    backend: webgl2(),
    plugins: createPluginHost()
      .use(physics({ gravityY: 1400 }))
      .use(overlay()),
  },
  ({ physics }) => {
    physics.world.addBox({ x: 300, y: 580, width: 600, height: 24, isStatic: true });
    const ball = physics.world.addCircle({ x: 300, y: 80, radius: 18, restitution: 0.7 });
    return {
      draw() {
        circle(ball.x, ball.y, ball.radius * 2);
      },
    };
  },
);
```

Do not also call `world.step` — the host already did. `overlay()` draws stats
and body outlines after the scene; `toggleKey: "F1"` makes it dismissible, and
it dims the bodies that are asleep.

Contacts are found before the step moves anything, and a pair closing faster
than it is wide still gets one: a body cannot cross something thinner than the
distance it covers in a frame, however fast it is thrown. Stacks hold because
the solver spends a velocity before the body does, not a frame behind it.

Bodies that stay still for long enough stop being simulated, in whole islands
rather than one at a time — a crate at the bottom of a stack does not sleep
under one still rocking on top of it. Anything that could disturb a sleeper
wakes it: an impulse, a force, something arriving, or a neighbour removed.
`world.wake(body)` is the manual door, and `body.isAwake` is readable.

```ts
world.addBox({ x, y, width: 40, height: 24, friction: 0.7, linearDamping: 0.2 });
```

Damping is a rate per second, and defaults to 0 — a vacuum, where a shoved
crate slides until it hits something. `physics({ linearDamping, angularDamping })`
sets the default every new body starts with. Friction and restitution combine
across the pair, friction as the geometric mean and restitution as the smaller
of the two, so `friction: 0` really does slide and `restitution: 0` really does
land dead.

### Joints

Two anchors held together, either between bodies or between a body and a point
in the world:

```ts
const anchor = world.addCircle({ x: 300, y: 40, radius: 6 });
const weight = world.addCircle({ x: 300, y: 160, radius: 14, density: 3 });
world.addDistanceJoint({ a: anchor, b: weight, length: 120 });

// Leaving `b` out pins to the world, and the B anchor is world coordinates.
world.addPinJoint({ a: arm, anchorAX: -65, anchorBX: 55, anchorBY: 120 });
```

A distance joint is a rod or a taut rope; a pin is a hinge, holding a point
while leaving rotation free. Both are rigid rather than springy: a chain
stretches under a shock and comes back, rather than staying long.

How well it holds depends on what it is holding. A load up to a few dozen
times a link's own mass hangs at the rest length exactly; past a couple of
hundred times, sequential impulses stop keeping up and the chain sags —
measured on a seven-link rope, 55x sat 2.5% long and 222x sat 30% long. Give
the links some mass of their own if a heavy thing hangs off them. A body
wedged between two links spreads them because it physically cannot be
anywhere else, and the chain closes again once it is gone.

Removing a body removes the joints attached to it. A scene that culls its
oldest body to stay under a budget should cull from what it spawned, or it
will eventually eat its own scenery one link at a time. Anchors are local to each body and default to its
centre. `removeJoint` cuts one, and removing a body takes its joints with it —
solving against a body the world no longer owns is a ghost constraint. Joints
join sleep islands, so a rope sleeps and wakes as one piece.

### Queries

```ts
const hit = createRayHit();
const target = world.raycast(x, y, dx, dy, { maxDistance: 400, ignore: player, out: hit });
const picked = world.pointQuery(input.mouseX, input.mouseY);
```

`raycast` returns the nearest body and writes the point, normal and distance
into `out`, so a caller holding one hit allocates nothing per shot. `ignore`
skips whatever fired it, which a shot from inside the shooter otherwise hits
every time. `pointQuery` returns the body under a point, latest first, which is
what picking wants. Sleeping bodies answer both — sleeping is a shortcut the
solver takes, not invisibility.

Pairs are found by sweeping a sorted axis rather than testing everything
against everything, so cost grows with the number of bodies rather than its
square: 1200 spread-out bodies cost 0.11 ms a step against 1.30 ms.

A body drifting slower than about 1.5 units a second counts as still, and will
eventually sleep. In a game with gravity that is what you want; a scene that
relies on very slow drift in a vacuum should keep its bodies awake.

`import { physics } from "hazumi/math"` is the solver on its own, if you want
to step it yourself. Platformers that slide on tiles still use `slideAabb`.

## Backends

| Import                     | Role                              |
| -------------------------- | --------------------------------- |
| `hazumi/backends/webgl2`   | Default renderer                  |
| `hazumi/backends/canvas2d` | 2D canvas                         |
| `hazumi/backends/svg`      | Vector export                     |
| `hazumi/backends/headless` | Recorded command stream for tests |

## Try it

```bash
bun install
bun run build
bun run dev
```

| Page          |                |
| ------------- | -------------- |
| `/`           | Landing page   |
| `/playground` | Live editor    |
| `/reference`  | API reference  |
| `/examples`   | Example scenes |

Requires [Bun](https://bun.sh) 1.3+.

## Site

`apps/web`, deployed on Vercel from `main`.

## License

MIT
