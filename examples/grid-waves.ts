/**
 * A grid modulated by layered noise.
 * Tests: dense per-frame drawing, rect, easing, colour interpolation.
 */
import { easing, mix, oklch, start, toCss, type MatterApp, type MatterContext } from "matter";
import { webgl2 } from "matter/backends/webgl2";

const COLS = 34;
const ROWS = 34;

export function gridWaves(parent: HTMLElement): MatterApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 3 }, () => {
    const cool = oklch(0.55, 0.17, 250);
    const warm = oklch(0.78, 0.16, 60);
    // Precompute the ramp: mixing in OKLCH per cell per frame would be wasted
    // work, and this is exactly the sort of thing a scene should hoist.
    const ramp = Array.from({ length: 32 }, (_, i) => toCss(mix(cool, warm, i / 31)));

    return {
      draw: (_alpha, { background, rect, fill, noise, width, height, t }: MatterContext): void => {
        background("oklch(0.12 0.02 260)");

        const cellW = width / COLS;
        const cellH = height / ROWS;

        for (let cx = 0; cx < COLS; cx++) {
          for (let cy = 0; cy < ROWS; cy++) {
            const n = noise.fbm2(cx * 0.09 + t * 0.15, cy * 0.09, 3);
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
