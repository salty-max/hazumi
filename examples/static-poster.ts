/**
 * A single-frame scene.
 * Tests: noLoop, lines, strokes, seeded reproducibility.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  background,
  circle,
  fill,
  line,
  noFill,
  rect,
  scoped,
  stroke,
  strokeWeight,
} from "hazumi/draw";
import { noLoop, random } from "hazumi/scene";

export function staticPoster(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 11 }, () => {
    noLoop();
    return {
      draw: (): void => {
        background("oklch(0.95 0.01 90)");

        // Ruled lines.
        stroke("oklch(0.3 0.05 250 / 0.5)");
        for (let i = 0; i < 40; i++) {
          strokeWeight(random.range(0.5, 3));
          const y = random.range(40, 560);
          line(40, y, 560, y + random.range(-25, 25));
        }

        // Discs, drawn inside a scoped style so nothing above leaks into them.
        scoped({ stroke: "oklch(0.2 0.04 260)", strokeWeight: 2.5 }, () => {
          for (let i = 0; i < 14; i++) {
            fill(`oklch(${random.range(0.5, 0.8)} 0.17 ${random.range(20, 320)} / 0.85)`);
            circle(random.range(90, 510), random.range(90, 510), random.range(40, 150));
          }
        });

        // The stroke set before `with` is still in effect here.
        noFill();
        rect(30, 30, 540, 540);
      },
    };
  });
}
