/**
 * Browser harness for `bun run test:browser`.
 *
 * The oracle in `bench/compare.ts` renders a scene through WebGL2 and through
 * Canvas2D and diffs them, which checks the rasteriser against the browser's
 * own. It cannot check the shader chain, because the oracle has no shader
 * stage — so the newest and most-changed part of the renderer had nothing
 * looking at it, and a bug in it looked like a scene that was merely dark.
 *
 * These checks fill that in from the other side. Rather than compare against a
 * second implementation or a committed image, each one draws something whose
 * correct output is arithmetic, runs it through a chain, and reads the pixels
 * back. That is robust across drivers in a way a golden image is not: two
 * machines disagree about antialiasing and agree about whether a multiply by a
 * quarter produced a quarter.
 *
 * Not linked from the site — Vite serves it as /passes.html in dev.
 */
import { start } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, fill, noStroke, rect } from "hazumi/draw";
import type { ShaderPass } from "hazumi/app";

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  /** What was measured, so a failure reads as a number rather than as "false". */
  readonly detail: string;
}

const SIZE = 64;

/** Straight through, unchanged. The base case a chain must not break. */
const IDENTITY = `
void main() { fragColor = texture(u_texture, v_uv); }
`;

/** Everything the scene was, quartered. */
const QUARTER = `
void main() { fragColor = vec4(texture(u_texture, v_uv).rgb * 0.25, 1.0); }
`;

/** Throw the frame away and write flat red, to prove a later pass can recover. */
const WRECK = `
void main() { fragColor = vec4(1.0, 0.0, 0.0, 1.0); }
`;

/** Whatever the scene was, whatever the chain has done since. */
const FROM_SCENE = `
void main() { fragColor = vec4(texture(u_scene, v_uv).rgb, 1.0); }
`;

/** The difference between the two inputs, which should be nothing at all. */
const DIFFERENCE = `
void main() {
  vec3 a = texture(u_texture, v_uv).rgb;
  vec3 b = texture(u_scene, v_uv).rgb;
  fragColor = vec4(abs(a - b) * 8.0, 1.0);
}
`;

/** Sample the supplied ramp across the frame, so filtering is measurable. */
const SAMPLE_RAMP = `
uniform sampler2D u_ramp;
void main() { fragColor = vec4(texture(u_ramp, vec2(v_uv.x, 0.5)).rgb, 1.0); }
`;

/** Half-transparent output, to see whether the author's alpha reaches the canvas. */
const HALF_ALPHA = `
void main() { fragColor = vec4(texture(u_texture, v_uv).rgb, 0.5); }
`;

/** A two-texel ramp, black to white, as an image a pass can be handed. */
function rampTexture(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D context for the ramp");
  const pixels = context.createImageData(2, 1);
  // Eight values, not seven: two pixels of RGBA. A missing final alpha makes
  // the white texel transparent, and premultiplied that is black — which is
  // exactly what the check reported the first time it ran.
  pixels.data.set([0, 0, 0, 255, 255, 255, 255, 255], 0);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

interface Rendered {
  /** One physical pixel, as `[r, g, b, a]`. */
  at: (x: number, y: number) => readonly [number, number, number, number];
  stop: () => void;
}

/**
 * Draw a scene once through a chain and hand back its pixels.
 *
 * The canvas is tiny and the loop never starts: one `redraw` is the whole
 * frame, which keeps a check to one deterministic image.
 */
async function render(
  passes: readonly ShaderPass[],
  draw: () => void,
  overlay?: () => void,
): Promise<Rendered> {
  const host = document.createElement("div");
  document.body.append(host);
  const app = start(
    { backend: webgl2(), width: SIZE, height: SIZE, pixelRatio: 1, parent: host },
    () => {
      if (passes.length > 0) app.setPasses(passes);
      return overlay === undefined ? { draw } : { draw, overlay };
    },
  );
  await app.ready;
  app.redraw();
  const pixels = app.loadPixels();
  return {
    at: (x, y) => {
      const [r, g, b, a] = pixels.get(x, y);
      return [r, g, b, a] as const;
    },
    stop: () => {
      app.stop();
      host.remove();
    },
  };
}

/** Mid grey, so a quarter of it is a whole number and a diff is visible. */
function drawGrey(): void {
  background("#000000");
  noStroke();
  fill("#808080");
  rect(0, 0, SIZE, SIZE);
}

function near(value: number, target: number, slack: number): boolean {
  return Math.abs(value - target) <= slack;
}

async function runPassChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const record = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  {
    // A chain that copies must hand back exactly what it was given. If this
    // fails, nothing below means anything.
    const framed = await render([{ fragment: IDENTITY }], drawGrey);
    const [r, g, b] = framed.at(32, 32);
    record(
      "an identity chain leaves the frame alone",
      near(r, 128, 2) && near(g, 128, 2) && near(b, 128, 2),
      `centre is ${r},${g},${b}, expected 128,128,128`,
    );
    framed.stop();
  }

  {
    const framed = await render([{ fragment: QUARTER }], drawGrey);
    const [r] = framed.at(32, 32);
    record("a pass actually runs over the frame", near(r, 32, 2), `centre is ${r}, expected 32`);
    framed.stop();
  }

  {
    // In the first pass the scene and the input are the same image, so their
    // difference is black. Amplified eightfold, any disagreement shows.
    const framed = await render([{ fragment: DIFFERENCE }], drawGrey);
    const [r, g, b] = framed.at(32, 32);
    record(
      "u_scene is the input in the first pass",
      r <= 2 && g <= 2 && b <= 2,
      `difference is ${r},${g},${b}, expected 0,0,0`,
    );
    framed.stop();
  }

  {
    // Two passes destroy the picture, the third reads the original back. This
    // is the whole point of keeping the scene in a target of its own.
    const framed = await render(
      [{ fragment: WRECK }, { fragment: WRECK }, { fragment: FROM_SCENE }],
      drawGrey,
    );
    const [r, g, b] = framed.at(32, 32);
    record(
      "u_scene survives passes that overwrite everything",
      near(r, 128, 2) && near(g, 128, 2) && near(b, 128, 2),
      `centre is ${r},${g},${b}, expected 128,128,128`,
    );
    framed.stop();
  }

  {
    // A two-texel ramp sampled across the frame. The middle must be halfway,
    // which it can only be if the texture is filtered: with nearest it is one
    // of the two ends and the gradient is a hard edge.
    const framed = await render(
      [{ fragment: SAMPLE_RAMP, textures: { u_ramp: rampTexture() } }],
      drawGrey,
    );
    const left = framed.at(2, 32)[0];
    const middle = framed.at(32, 32)[0];
    const right = framed.at(61, 32)[0];
    record(
      "a pass texture is bound, and filtered",
      left < 60 && near(middle, 128, 12) && right > 195,
      `ramp reads ${left} .. ${middle} .. ${right}, expected dark .. ~128 .. bright`,
    );
    framed.stop();
  }

  {
    // The overlay is drawn after the chain has presented, so the quartering
    // must not reach it. Scene on the left, overlay stripe on the right.
    const framed = await render([{ fragment: QUARTER }], drawGrey, () => {
      noStroke();
      fill("#808080");
      rect(SIZE / 2, 0, SIZE / 2, SIZE);
    });
    const graded = framed.at(16, 32)[0];
    const plain = framed.at(48, 32)[0];
    record(
      "the overlay is not put through the chain",
      near(graded, 32, 2) && near(plain, 128, 2),
      `scene reads ${graded} (expected 32), overlay reads ${plain} (expected 128)`,
    );
    framed.stop();
  }

  {
    // Characterisation, not a preference: a pass writing partial alpha reaches
    // the canvas with it. A pass that drops pixels with vec4(0.0) is therefore
    // writing a transparent frame, not a black one — which is invisible over a
    // dark page and wrong everywhere else.
    const framed = await render([{ fragment: HALF_ALPHA }], drawGrey);
    const alpha = framed.at(32, 32)[3];
    record(
      "a pass owns the alpha it writes",
      near(alpha, 128, 4),
      `alpha is ${alpha}, expected 128`,
    );
    framed.stop();
  }

  return checks;
}

(globalThis as unknown as { runPassChecks: typeof runPassChecks }).runPassChecks = runPassChecks;
