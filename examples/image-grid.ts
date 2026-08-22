/**
 * Images and input.
 * Tests: async scene creation, image upload and reuse, keyboard and pmouse.
 */
import { loadImage } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, fill, image, rect, text, textSize } from "hazumi/draw";
import { input, keyIsDown } from "hazumi/input";
import { screen, time } from "hazumi/scene";

export function imageGrid(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 5 }, async () => {
    // No preload phase: the scene factory is async and await means what it means.
    const swatch = await loadImage("/examples/assets/swatch.png");

    return {
      draw: (): void => {
        background("oklch(0.14 0.02 265)");

        const cols = keyIsDown("ArrowRight") ? 10 : 6;
        const cell = screen.width / cols;

        for (let x = 0; x < cols; x++) {
          for (let y = 0; y < cols; y++) {
            const wobble = Math.sin(time.elapsed * 2 + (x + y) * 0.4) * 6;
            // The same source every time — it uploads once and is reused.
            image(swatch, x * cell + 6, y * cell + 6 + wobble, cell - 12, cell - 12);
          }
        }

        // Cursor speed, which is what pmouse is for.
        const speed = Math.hypot(
          input.mouseX - input.previousMouseX,
          input.mouseY - input.previousMouseY,
        );
        fill("oklch(0.75 0.19 40)");
        rect(0, screen.height - 6 - speed * 2, screen.width, 6 + speed * 2);

        fill("oklch(0.95 0.02 90)");
        textSize(14);
        text("hold → for more tiles", 16, 28);
      },
    };
  });
}
