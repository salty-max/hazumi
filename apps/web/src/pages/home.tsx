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

        <div className="mt-14 grid gap-4 md:grid-cols-3">
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
    </main>
  );
}
