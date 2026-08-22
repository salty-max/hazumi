/**
 * Click or drag to throw sparks. A fountain at the bottom keeps emitting.
 * Tests: pooled particles, gravity, colour fade, zero-alloc fillRgba path.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { Blend, background, fill, text, textSize } from "hazumi/draw";
import { input } from "hazumi/input";
import { particles } from "hazumi/particles";
import { screen } from "hazumi/scene";

export function sparks(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 4 }, () => {
    const burst = particles({ capacity: 400, gravity: { y: 520 }, drag: 0.6, blend: Blend.Add });
    const fountain = particles({ capacity: 180, gravity: { y: 380 }, drag: 0.4, blend: Blend.Add });

    return {
      update: (dt: number): void => {
        fountain.drip(
          {
            x: [screen.width / 2 - 10, screen.width / 2 + 10],
            y: screen.height - 36,
            rate: 180,
            speed: [80, 160],
            angle: [-Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35],
            spin: [-4, 4],
            life: [0.5, 1.1],
            size: [4, 9],
            color: "oklch(0.82 0.16 55)",
            endColor: "oklch(0.45 0.18 20 / 0)",
          },
          dt,
        );
        if (input.mouseIsPressed) {
          burst.emit({
            x: input.mouseX,
            y: input.mouseY,
            count: 14,
            speed: [60, 220],
            spin: [-10, 10],
            life: [0.25, 0.7],
            size: [3, 8],
            color: "oklch(0.9 0.14 250)",
            endColor: "oklch(0.55 0.2 300 / 0)",
          });
        }
        fountain.update(dt);
        burst.update(dt);
      },
      draw: (alpha: number): void => {
        background("oklch(0.13 0.03 265)");
        fountain.draw(alpha);
        burst.draw(alpha);
        fill("oklch(0.86 0.03 250)");
        textSize(14);
        text("click / drag", 16, 28);
      },
    };
  });
}
