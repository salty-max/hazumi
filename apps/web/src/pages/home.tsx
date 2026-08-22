import type { JSX } from "react";
import { ButtonLink } from "../components/button-link";
import { CodeWindow } from "../components/code-window";
import { Container } from "../components/container";

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

export function HomePage(): JSX.Element {
  return (
    <main>
      <Container className="grid items-center gap-14 pt-20 pb-24 lg:grid-cols-[1.05fr_.95fr] lg:pt-28 lg:pb-32">
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
            <ButtonLink to="/reference" variant="outline" size="lg">
              Reference
            </ButtonLink>
          </div>
        </div>

        <div className="relative lg:pl-8">
          <div className="absolute -top-8 -right-5 size-40 rounded-full bg-primary/15 blur-3xl" />
          <CodeWindow filename="scene.ts" source={SAMPLE} />
        </div>
      </Container>
    </main>
  );
}
