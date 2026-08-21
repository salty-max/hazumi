/**
 * A single-frame scene.
 * Tests: noLoop, lines, strokes, seeded reproducibility.
 */
import { start, type MatterApp } from "matter/app";
import { webgl2 } from "matter/backends/webgl2";
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
} from "matter/draw";
import { noLoop, random } from "matter/scene";

export function staticPoster(parent: HTMLElement): MatterApp {
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
