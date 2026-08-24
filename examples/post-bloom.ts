/**
 * A post-processing chain: threshold, then a separable blur.
 * Tests: render targets, ping-pong, per-pass uniforms, texelSize().
 *
 * This is the case the architecture exists for — shaders as a normal feature
 * rather than an escape hatch. The scene is deliberately plain; the whole look
 * comes from the chain.
 *
 * The chain replaces the frame rather than adding to it, because a pass only
 * ever sees the pass before it. That decides how the scene has to be drawn: if
 * the shapes saturate, the threshold keeps all of them and the blur spreads one
 * white sheet over the frame. So they are drawn translucent and spread apart,
 * and what survives the cutoff is their cores — which is what blooms.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, blendMode, Blend, circle, fill } from "hazumi/draw";
import { screen, setPasses, time } from "hazumi/scene";

/**
 * Keep only the bright parts, so the blur has something to bloom.
 *
 * Opaque black for what it drops, rather than `vec4(0.0)`. Zero alpha looks the
 * same over a dark page and is not the same thing at all: the frame comes back
 * transparent, so anything the canvas is composited onto shows through — which
 * a still of the scene finds immediately.
 */
const THRESHOLD = `
uniform float u_cutoff;
void main() {
  vec4 c = texture(u_texture, v_uv);
  float brightness = max(c.r, max(c.g, c.b));
  fragColor = vec4(brightness > u_cutoff ? c.rgb : vec3(0.0), 1.0);
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
      { fragment: THRESHOLD, uniforms: { u_cutoff: 0.62 } },
      { fragment: blur(3, 0) },
      { fragment: blur(0, 3) },
    ]);

    return {
      draw: (): void => {
        background("oklch(0.11 0.02 265)");
        blendMode(Blend.Add);

        const count = 34;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + time.elapsed * 0.3;
          const r = 150 + Math.sin(time.elapsed + i * 0.35) * 78;
          // Translucent, so two that cross make a brighter core rather than
          // another patch of white.
          fill(
            `oklch(${0.74 + 0.16 * Math.sin(i)} 0.24 ${(i * 11 + time.elapsed * 40) % 360} / 0.62)`,
          );
          circle(screen.width / 2 + Math.cos(a) * r, screen.height / 2 + Math.sin(a * 1.3) * r, 22);
        }
      },
    };
  });
}
