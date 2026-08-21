/**
 * Particles advected through a noise field.
 * Tests: seeded noise, additive blending, per-particle colour, long trails.
 */
import { start, type MatterApp } from "matter/app";
import { webgl2 } from "matter/backends/webgl2";
import { background, blendMode, Blend, circle, fill } from "matter/draw";
import { noise, random, screen, time } from "matter/scene";

const COUNT = 4000;

export function flowField(parent: HTMLElement): MatterApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 7 }, () => {
    const xs = new Float32Array(COUNT);
    const ys = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      xs[i] = random.range(0, screen.width);
      ys[i] = random.range(0, screen.height);
    }

    background("oklch(0.15 0.03 260)");

    return {
      draw: (): void => {
        // Translucent background: fades the previous frame instead of clearing
        // it, which is what leaves trails behind the particles.
        background("oklch(0.15 0.03 260 / 0.06)");
        blendMode(Blend.Add);
        for (let i = 0; i < COUNT; i++) {
          const x = xs[i] as number;
          const y = ys[i] as number;
          const angle = noise.noise3(x * 0.003, y * 0.003, time.elapsed * 0.1) * Math.PI * 3;

          const nx = x + Math.cos(angle) * 1.4;
          const ny = y + Math.sin(angle) * 1.4;
          xs[i] = nx < 0 ? screen.width : nx > screen.width ? 0 : nx;
          ys[i] = ny < 0 ? screen.height : ny > screen.height ? 0 : ny;

          fill(i % 3 === 0 ? "oklch(0.7 0.15 200 / 0.06)" : "oklch(0.6 0.18 300 / 0.05)");
          circle(nx, ny, 2.5);
        }
      },
    };
  });
}
