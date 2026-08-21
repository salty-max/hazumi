/**
 * A single-frame scene.
 * Tests: noLoop, lines, strokes, seeded reproducibility.
 */
import { start, type MatterApp, type MatterContext } from "matter";
import { webgl2 } from "matter/backends/webgl2";

export function staticPoster(parent: HTMLElement): MatterApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 11 }, (s) => {
    s.noLoop();
    return {
      draw: (_alpha: number, scene: MatterContext): void => {
        scene.background("oklch(0.95 0.01 90)");

        // Ruled lines.
        scene.stroke("oklch(0.3 0.05 250 / 0.5)");
        for (let i = 0; i < 40; i++) {
          scene.strokeWeight(scene.random.range(0.5, 3));
          const y = scene.random.range(40, 560);
          scene.line(40, y, 560, y + scene.random.range(-25, 25));
        }

        // Discs, drawn inside a scoped style so nothing above leaks into them.
        scene.with({ stroke: "oklch(0.2 0.04 260)", strokeWeight: 2.5 }, () => {
          for (let i = 0; i < 14; i++) {
            scene.fill(
              `oklch(${scene.random.range(0.5, 0.8)} 0.17 ${scene.random.range(20, 320)} / 0.85)`,
            );
            scene.circle(
              scene.random.range(90, 510),
              scene.random.range(90, 510),
              scene.random.range(40, 150),
            );
          }
        });

        // The stroke set before `with` is still in effect here.
        scene.noFill();
        scene.rect(30, 30, 540, 540);
      },
    };
  });
}
