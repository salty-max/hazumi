/**
 * Particles advected through a noise field.
 * Tests: seeded noise, additive blending, per-particle colour, long trails.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, blendMode, Blend, circle, fill } from "hazumi/draw";
import { noise, random, screen, time } from "hazumi/scene";

const COUNT = 4000;

/**
 * Trail colours, built once and picked by the direction a particle is going.
 *
 * Two reasons, and both matter. A template string per particle is four thousand
 * strings a frame, which is exactly the per-frame allocation this repo rules
 * out; and colouring by angle rather than by index draws the field itself —
 * where the flow turns, the colour turns with it, so the structure is visible
 * instead of being a uniform blue haze.
 */
const PALETTE = Array.from(
  { length: 24 },
  (_, i) => `oklch(0.86 0.19 ${Math.round((i * 360) / 24)} / 0.16)`,
);

const TAU = Math.PI * 2;
const PALETTE_STEP = PALETTE.length / TAU;

export function flowField(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 7 }, () => {
    const xs = new Float32Array(COUNT);
    const ys = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      xs[i] = random.range(0, screen.width);
      ys[i] = random.range(0, screen.height);
    }

    background("oklch(0.09 0.02 265)");

    return {
      draw: (): void => {
        // Translucent background: fades the previous frame instead of clearing
        // it, which is what leaves trails behind the particles.
        background("oklch(0.09 0.02 265 / 0.045)");
        blendMode(Blend.Add);
        for (let i = 0; i < COUNT; i++) {
          const x = xs[i] as number;
          const y = ys[i] as number;
          const angle = noise.noise3(x * 0.003, y * 0.003, time.elapsed * 0.1) * Math.PI * 3;

          const nx = x + Math.cos(angle) * 1.4;
          const ny = y + Math.sin(angle) * 1.4;
          xs[i] = nx < 0 ? screen.width : nx > screen.width ? 0 : nx;
          ys[i] = ny < 0 ? screen.height : ny > screen.height ? 0 : ny;

          const bucket = Math.floor((((angle % TAU) + TAU) % TAU) * PALETTE_STEP) % PALETTE.length;
          fill(PALETTE[bucket] as string);
          circle(nx, ny, 2.2);
        }
      },
    };
  });
}
