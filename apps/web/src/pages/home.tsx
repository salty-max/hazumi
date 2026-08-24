import type { JSX } from "react";
import { ButtonLink } from "../components/button-link";
import { CodeBlock } from "../components/code-block";
import { CodeWindow } from "../components/code-window";
import { Container } from "../components/container";
import { InlineCode } from "../components/inline-code";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const SAMPLE = `import { start } from 'hazumi/app';
import { background, circle, fill } from 'hazumi/draw';
import { camera } from 'hazumi/scene';
import { webgl2 } from 'hazumi/backends/webgl2';

start({ backend: webgl2(), width: 600, height: 600 }, () => {
  const player = { x: 300, y: 300 };

  return {
    update(dt) {
      player.x += 40 * dt;
      camera.follow(player.x, player.y, 0.12);
    },
    draw() {
      background('#090d16');
      fill('oklch(.74 .18 160)');
      circle(player.x, player.y, 48);
    },
  };
});`;

const ASSETS = `import {
  fromAseprite, fromTiled, loadImage, loadJson, spritesheet, tilemap,
} from 'hazumi/assets';

const hero = spritesheet(
  await loadImage('hero.png'),
  fromAseprite(await loadJson('hero.json')),
);
const run = hero.clip('run');

const level = tilemap(
  fromTiled(await loadJson('level-1.tmj'), { terrain }),
);`;

const SHEETS = `const ui = spritesheet(sheet, {
  frame: [12, 13],
  columns: [88, 100, 112, 125, 137, 149, 162, 174, 186],
  rows: [0, 14, 28, 42, 56, 70, 84, 98],
  frames: { play: [3, 0], trophy: [0, 3] },
});
ui.named('play');   // typed: 'play' | 'trophy'

const room = tilemap({
  tileWidth: 16, tileHeight: 16,
  layers: [{
    name: 'ground', sheet: tiles,
    key: { '#': 'wall', '.': 'floor', ' ': null },
    tiles: ['#####', '#...#', '##.##'],
  }],
});`;

const POINTS: ReadonlyArray<{ readonly title: string; readonly body: string }> = [
  {
    title: "One buffer",
    body: "WebGL2 is the renderer. Canvas2D is the oracle. SVG exports. Headless records commands for tests.",
  },
  {
    title: "Capability imports",
    body: "hazumi/draw, hazumi/input, hazumi/scene. They resolve to the scene that is running.",
  },
  {
    title: "Fixed step",
    body: "update(dt) on a clock. draw(alpha) on the display. Interpolate without touching the sim.",
  },
  {
    title: "Sampled tweens",
    body: "tween() is a function of elapsed time. Nothing to tick, nothing to own, and it rewinds.",
  },
];

export function HomePage(): JSX.Element {
  return (
    <main>
      <Container className="grid grid-cols-[minmax(0,1fr)] items-center gap-14 pt-20 pb-16 lg:grid-cols-[1.05fr_.95fr] lg:pt-28 lg:pb-24">
        <div>
          <h1 className="max-w-4xl font-display text-[clamp(3rem,7vw,5.6rem)] leading-[.92] font-semibold tracking-[-.05em]">
            A typed 2D graphics library
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground">
            Draw with functions. The same scene runs on WebGL2, Canvas2D, SVG, or a command recorder
            in a test.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink to="/playground" size="lg">
              Playground
            </ButtonLink>
            <ButtonLink to="/examples" variant="outline" size="lg">
              Examples
            </ButtonLink>
          </div>
        </div>

        <div className="relative lg:pl-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-8 -right-5 size-40 rounded-full bg-primary/15 blur-3xl"
          />
          <CodeWindow filename="scene.ts" source={SAMPLE} />
        </div>
      </Container>

      <Container className="pb-24">
        <p className="mb-3 font-mono text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Scaffold
        </p>
        <CodeBlock source="bun create hazumi" className="max-w-xl" />
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          A Vite app. <InlineCode>vite build</InlineCode> writes a static{" "}
          <InlineCode>dist/</InlineCode> you can zip.
        </p>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point) => (
            <Card key={point.title}>
              <CardHeader className="border-b-0 pb-0">
                <CardTitle className="font-display text-lg tracking-tight">{point.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 text-sm leading-6 text-muted-foreground">
                {point.body}
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>

      <Container className="pb-28">
        <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
          <div>
            <p className="mb-3 font-mono text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Assets
            </p>
            <h2 className="max-w-md font-display text-3xl leading-tight font-semibold tracking-tight">
              What your tools export is what the scene reads
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Aseprite tags become clips, keeping their per-frame durations. Tiled layers become a
              tilemap. Both are pure transforms, so nothing fetches behind your back — and the scene
              factory is already async, so there is no preload phase to thread through.
            </p>
          </div>
          <CodeBlock source={ASSETS} className="p-5 leading-7" />
        </div>
      </Container>

      <Container className="pb-28">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
          <CodeBlock source={SHEETS} className="p-5 leading-7" />
          <div>
            <p className="mb-3 font-mono text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Sheets
            </p>
            <h2 className="max-w-md font-display text-3xl leading-tight font-semibold tracking-tight">
              And when there is no exporter
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              A sheet built from a literal knows its own frame names, so a typo is a compile error
              rather than a scene that throws on the frame it first draws. Grids take explicit
              offsets for art laid out in blocks, a name can point at a cell, and a rectangle that
              hangs off the edge says which edge and by how much. A tilemap layer takes a picture
              instead of eighty numbers.
            </p>
            <div className="mt-6">
              <ButtonLink to="/slicer" variant="outline">
                Open the Slicer
              </ButtonLink>
            </div>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Drop a sheet and it tells you how it is cut, then writes the call for you.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}
