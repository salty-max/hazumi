/**
 * Does a stencil-filled path survive a post-processing chain?
 *
 * A path fill counts winding in the stencil buffer. With passes active the
 * scene renders into an offscreen target instead of the canvas, so the target
 * needs a stencil attachment of its own — and a target without one turns every
 * filled path into its own bounding box.
 *
 * The main comparison harness cannot cover this: it checks the GPU against
 * Canvas2D, which has no shader stage, so the combination only exists here.
 */
import { CommandBuffer } from "@matter/graphics";
import { Webgl2Renderer } from "@matter/backend-webgl2";

const W = 200;
const H = 200;
const out = document.getElementById("out") as HTMLElement;

function drawPath(b: CommandBuffer): void {
  b.reset();
  b.background(0, 0, 0, 1);
  b.setFill(1, 1, 1, 1);
  // A triangle occupying half of a 120x110 box — about 16.5% of the frame when
  // filled correctly, and 33% (the whole box) when the stencil is missing.
  b.beginPath();
  b.moveTo(100, 40);
  b.lineTo(160, 150);
  b.lineTo(40, 150);
  b.closePath();
  b.fillPath();
}

function coverage(canvas: HTMLCanvasElement): number {
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let lit = 0;
  for (let i = 0; i < px.length; i += 4) if ((px[i] as number) > 128) lit++;
  return (lit / (W * H)) * 100;
}

function run(withPasses: boolean): number {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  document.body.append(canvas);

  const renderer = new Webgl2Renderer(canvas);
  renderer.setViewport(W, H);
  if (withPasses) {
    // An identity pass: it changes nothing visually, so any difference is the
    // render target, not the shader.
    renderer.setPasses([{ fragment: "void main() { fragColor = texture(u_texture, v_uv); }" }]);
  }

  const buffer = new CommandBuffer();
  drawPath(buffer);
  renderer.render(buffer);
  return coverage(canvas);
}

const direct = run(false);
const viaPass = run(true);

out.textContent = [
  `to canvas       ${direct.toFixed(1)}% lit`,
  `through a pass  ${viaPass.toFixed(1)}% lit`,
  "",
  `expected: both about 16.5% — the triangle, not its 33% bounding box`,
  `VERDICT: ${Math.abs(direct - viaPass) < 2 ? "MATCH" : "MISMATCH — stencil lost through the pass"}`,
].join("\n");
