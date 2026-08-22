/**
 * A post-processing chain: threshold, then a separable blur.
 * Tests: render targets, ping-pong, per-pass uniforms, texelSize().
 *
 * This is the case the architecture exists for — shaders as a normal feature
 * rather than an escape hatch. The scene is deliberately plain; the whole look
 * comes from the chain.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, blendMode, Blend, circle, fill } from "hazumi/draw";
import { screen, setPasses, time } from "hazumi/scene";

/** Keep only the bright parts, so the blur has something to bloom. */
const THRESHOLD = `
uniform float u_cutoff;
void main() {
  vec4 c = texture(u_texture, v_uv);
  float brightness = max(c.r, max(c.g, c.b));
  fragColor = brightness > u_cutoff ? c : vec4(0.0);
}
`;

/** Separable: two cheap 1D passes instead of one expensive 2D one. */
const blur = (dx: number, dy: number): string => `
void main() {
  vec2 step = texelSize() * vec2(${dx.toFixed(1)}, ${dy.toFixed(1)});
  vec4 sum = texture(u_texture, v_uv) * 0.227;
  sum += (texture(u_texture, v_uv + step * 1.38) + texture(u_texture, v_uv - step * 1.38)) * 0.316;
  sum += (texture(u_texture, v_uv + step * 3.23) + texture(u_texture, v_uv - step * 3.23)) * 0.070;
  fragColor = sum;
}
`;

export function postBloom(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 9 }, () => {
    // Configuration, so it belongs in scene creation rather than the draw loop.
    setPasses([
      { fragment: THRESHOLD, uniforms: { u_cutoff: 0.5 } },
      { fragment: blur(4, 0) },
      { fragment: blur(0, 4) },
    ]);

    return {
      draw: (): void => {
        background("oklch(0.11 0.02 265)");
        blendMode(Blend.Add);

        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2 + time.elapsed * 0.3;
          const r = 120 + Math.sin(time.elapsed + i * 0.35) * 70;
          fill(`oklch(${0.72 + 0.2 * Math.sin(i)} 0.22 ${(i * 6 + time.elapsed * 40) % 360})`);
          circle(screen.width / 2 + Math.cos(a) * r, screen.height / 2 + Math.sin(a * 1.3) * r, 26);
        }
      },
    };
  });
}
