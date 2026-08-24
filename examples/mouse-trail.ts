/**
 * A trail that draws itself until you take it over.
 * Tests: mouse input, per-frame state, ellipse, alpha fade.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, ellipse, fill } from "hazumi/draw";
import { input } from "hazumi/input";
import { screen, time } from "hazumi/scene";

const TRAIL = 90;
/** How long the trail waits before deciding you have let go of it. */
const IDLE_AFTER = 1.4;

export function mouseTrail(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent }, () => {
    const px = new Float32Array(TRAIL).fill(screen.width / 2);
    const py = new Float32Array(TRAIL).fill(screen.height / 2);
    let head = 0;
    let idle = IDLE_AFTER;
    let lastX = input.mouseX;
    let lastY = input.mouseY;
    // Where the trail is actually heading, so taking over and letting go are
    // both a lean rather than a jump.
    let x = screen.width / 2;
    let y = screen.height / 2;

    return {
      draw: (): void => {
        background("oklch(0.14 0.02 280)");

        const moved = input.mouseX !== lastX || input.mouseY !== lastY;
        lastX = input.mouseX;
        lastY = input.mouseY;
        idle = moved ? 0 : idle + time.delta;

        // A cursor that has not moved leaves sixty samples stacked on one
        // point, which is a dot. So the trail flies a slow figure of its own
        // until a real cursor arrives, and drifts back to it afterwards.
        const t = time.elapsed;
        const driftX = screen.width / 2 + Math.cos(t * 0.7) * screen.width * 0.32;
        const driftY = screen.height / 2 + Math.sin(t * 1.1) * screen.height * 0.3;
        const guided = idle < IDLE_AFTER;
        const targetX = guided ? input.mouseX : driftX;
        const targetY = guided ? input.mouseY : driftY;
        const lean = guided ? 0.45 : 0.06;
        x += (targetX - x) * lean;
        y += (targetY - y) * lean;

        head = (head + 1) % TRAIL;
        px[head] = x;
        py[head] = y;

        for (let i = 0; i < TRAIL; i++) {
          const index = (head - i + TRAIL) % TRAIL;
          const age = i / TRAIL;
          const size = (1 - age) * (input.mouseIsPressed ? 52 : 34) + 4;
          fill(`oklch(${0.9 - age * 0.4} ${0.2 - age * 0.11} ${250 + i * 1.6} / ${1 - age})`);
          ellipse(px[index] as number, py[index] as number, size, size * 0.7);
        }
      },
    };
  });
}
