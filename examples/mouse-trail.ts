/**
 * A trail that follows the cursor.
 * Tests: mouse input, per-frame state, ellipse, alpha fade.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, ellipse, fill } from "hazumi/draw";
import { input } from "hazumi/input";
import { screen } from "hazumi/scene";

const TRAIL = 60;

export function mouseTrail(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent }, () => {
    const px = new Float32Array(TRAIL).fill(screen.width / 2);
    const py = new Float32Array(TRAIL).fill(screen.height / 2);
    let head = 0;

    return {
      draw: (): void => {
        background("oklch(0.14 0.02 280)");

        head = (head + 1) % TRAIL;
        px[head] = input.mouseX;
        py[head] = input.mouseY;

        for (let i = 0; i < TRAIL; i++) {
          const index = (head - i + TRAIL) % TRAIL;
          const age = i / TRAIL;
          const size = (1 - age) * (input.mouseIsPressed ? 46 : 28) + 4;
          fill(`oklch(${0.85 - age * 0.35} ${0.18 - age * 0.1} ${260 + i * 2} / ${1 - age})`);
          ellipse(px[index] as number, py[index] as number, size, size * 0.7);
        }
      },
    };
  });
}
