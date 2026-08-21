/**
 * A trail that follows the cursor.
 * Tests: mouse input, per-frame state, ellipse, alpha fade.
 */
import { start, type MatterApp, type MatterContext } from "matter";
import { webgl2 } from "matter/backends/webgl2";

const TRAIL = 60;

export function mouseTrail(parent: HTMLElement): MatterApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent }, (s) => {
    const px = new Float32Array(TRAIL).fill(s.width / 2);
    const py = new Float32Array(TRAIL).fill(s.height / 2);
    let head = 0;

    return {
      draw: (
        _alpha,
        { background, ellipse, fill, mouseX, mouseY, mouseIsPressed }: MatterContext,
      ): void => {
        background("oklch(0.14 0.02 280)");

        head = (head + 1) % TRAIL;
        px[head] = mouseX;
        py[head] = mouseY;

        for (let i = 0; i < TRAIL; i++) {
          const index = (head - i + TRAIL) % TRAIL;
          const age = i / TRAIL;
          const size = (1 - age) * (mouseIsPressed ? 46 : 28) + 4;
          fill(`oklch(${0.85 - age * 0.35} ${0.18 - age * 0.1} ${260 + i * 2} / ${1 - age})`);
          ellipse(px[index] as number, py[index] as number, size, size * 0.7);
        }
      },
    };
  });
}
