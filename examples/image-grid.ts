/**
 * Images and input.
 * Tests: async setup, image upload and reuse, tint, keyboard and pmouse.
 */
import { sketch, type SketchContext, type SketchHandle } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

export function imageGrid(parent: HTMLElement): SketchHandle {
  return sketch({ backend: webgl2(), width: 600, height: 600, parent, seed: 5 }, async (s) => {
    // No preload phase: setup is async and await means what it means.
    const swatch = await s.loadImage('./assets/swatch.png');

    return ({ background, image, rect, fill, text, textSize, width, height, t,
              mouseX, mouseY, pmouseX, pmouseY, keyIsDown }: SketchContext) => {
      background('oklch(0.14 0.02 265)');

      const cols = keyIsDown('ArrowRight') ? 10 : 6;
      const cell = width / cols;

      for (let x = 0; x < cols; x++) {
        for (let y = 0; y < cols; y++) {
          const wobble = Math.sin(t * 2 + (x + y) * 0.4) * 6;
          // The same source every time — it uploads once and is reused.
          image(swatch, x * cell + 6, y * cell + 6 + wobble, cell - 12, cell - 12);
        }
      }

      // Cursor speed, which is what pmouse is for.
      const speed = Math.hypot(mouseX - pmouseX, mouseY - pmouseY);
      fill('oklch(0.75 0.19 40)');
      rect(0, height - 6 - speed * 2, width, 6 + speed * 2);

      fill('oklch(0.95 0.02 90)');
      textSize(14);
      text('hold → for more tiles', 16, 28);
    };
  });
}
