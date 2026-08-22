/**
 * A grid modulated by layered noise.
 * Tests: dense per-frame drawing, rect, easing, colour interpolation.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { mix, oklch, toCss } from "hazumi/color";
import { background, fill, rect } from "hazumi/draw";
import { easing } from "hazumi/math";
import { noise, screen, time } from "hazumi/scene";

const COLS = 34;
const ROWS = 34;

export function gridWaves(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 3 }, () => {
    const cool = oklch(0.55, 0.17, 250);
    const warm = oklch(0.78, 0.16, 60);
    // Precompute the ramp: mixing in OKLCH per cell per frame would be wasted
    // work, and this is exactly the sort of thing a scene should hoist.
    const ramp = Array.from({ length: 32 }, (_, i) => toCss(mix(cool, warm, i / 31)));

    return {
      draw: (): void => {
        background("oklch(0.12 0.02 260)");

        const cellW = screen.width / COLS;
        const cellH = screen.height / ROWS;

        for (let cx = 0; cx < COLS; cx++) {
          for (let cy = 0; cy < ROWS; cy++) {
            const n = noise.fbm2(cx * 0.09 + time.elapsed * 0.15, cy * 0.09, 3);
            const level = easing.quadInOut(Math.min(Math.max((n + 1) / 2, 0), 1));
            const size = 4 + level * (Math.min(cellW, cellH) - 5);

            fill(ramp[Math.min(31, Math.floor(level * 32))] as string);
            rect(cx * cellW + (cellW - size) / 2, cy * cellH + (cellH - size) / 2, size, size);
          }
        }
      },
    };
  });
}
