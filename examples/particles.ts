/**
 * A fountain that keeps throwing sparks, and bursts you can throw yourself.
 * Tests: pooled particles, gravity, colour fade, zero-alloc fillRgba path.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { Blend, background, fill, text, textSize } from "hazumi/draw";
import { input } from "hazumi/input";
import { particles } from "hazumi/particles";
import { random, screen } from "hazumi/scene";

export function sparks(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 4 }, () => {
    const burst = particles({ capacity: 700, gravity: { y: 520 }, drag: 0.6, blend: Blend.Add });
    const fountain = particles({ capacity: 900, gravity: { y: 380 }, drag: 0.2, blend: Blend.Add });
    // Somewhere for the automatic bursts to go off, wandering so two of them
    // are never in the same place.
    let sinceBurst = 0;

    return {
      update: (dt: number): void => {
        fountain.drip(
          {
            x: [screen.width / 2 - 14, screen.width / 2 + 14],
            y: screen.height - 30,
            rate: 620,
            // Enough to clear two thirds of the frame: a fountain that dies at
            // ankle height reads as a fault rather than as a fountain.
            speed: [420, 620],
            angle: [-Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3],
            spin: [-4, 4],
            life: [0.9, 1.6],
            size: [4, 11],
            color: "oklch(0.82 0.16 55)",
            endColor: "oklch(0.45 0.18 20 / 0)",
          },
          dt,
        );
        sinceBurst += dt;
        // The scene has to be worth looking at before anyone thinks to click
        // it, so it throws its own bursts until someone does.
        const held = input.mouseIsPressed;
        if (held || sinceBurst > 0.85) {
          const spread = held ? 0 : 1;
          sinceBurst = held ? sinceBurst : 0;
          burst.emit({
            x: held ? input.mouseX : random.range(120, screen.width - 120),
            y: held ? input.mouseY : random.range(120, screen.height - 200),
            count: held ? 14 : 60,
            speed: [60, 220 + spread * 180],
            spin: [-10, 10],
            life: [0.25, 0.7 + spread * 0.5],
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
        text("click or drag to throw your own", 16, 28);
      },
    };
  });
}
