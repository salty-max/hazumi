/**
 * A post-processing chain: threshold, then a separable blur.
 * Tests: render targets, ping-pong, per-pass uniforms, texelSize().
 *
 * This is the case the architecture exists for — shaders as a normal feature
 * rather than an escape hatch. The scene is deliberately plain; the whole look
 * comes from the chain.
 */
import { Blend, start, type MatterApp, type MatterContext } from "matter";
import { webgl2 } from "matter/backends/webgl2";

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

export function postBloom(parent: HTMLElement): MatterApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 9 }, (s) => {
    // Configuration, so it belongs in scene creation rather than the draw loop.
    s.setPasses([
      { fragment: THRESHOLD, uniforms: { u_cutoff: 0.5 } },
      { fragment: blur(4, 0) },
      { fragment: blur(0, 4) },
    ]);

    return {
      draw: (
        _alpha,
        { background, circle, fill, blendMode, width, height, t }: MatterContext,
      ): void => {
        background("oklch(0.11 0.02 265)");
        blendMode(Blend.Add);

        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2 + t * 0.3;
          const r = 120 + Math.sin(t + i * 0.35) * 70;
          fill(`oklch(${0.72 + 0.2 * Math.sin(i)} 0.22 ${(i * 6 + t * 40) % 360})`);
          circle(width / 2 + Math.cos(a) * r, height / 2 + Math.sin(a * 1.3) * r, 26);
        }
      },
    };
  });
}
