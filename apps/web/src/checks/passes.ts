/**
 * The shader chain: does a pass run, and does it see what it should.
 *
 * Every chain here has an output you can work out on paper, which is what
 * makes these readable as failures — see `harness.ts` for why that is the
 * shape rather than a set of committed images.
 */
import { background, fill, noStroke, rect } from "hazumi/draw";
import { CheckList, near, render, SIZE, type Check } from "./harness";

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

/** Mid grey, so a quarter of it is a whole number and a diff is visible. */
function drawGrey(): void {
  background("#000000");
  noStroke();
  fill("#808080");
  rect(0, 0, SIZE, SIZE);
}

export async function passChecks(): Promise<readonly Check[]> {
  const list = new CheckList();
  const record = list.record.bind(list);

  {
    // A chain that copies must hand back exactly what it was given. If this
    // fails, nothing below means anything.
    const framed = await render(drawGrey, { passes: [{ fragment: IDENTITY }] });
    const [r, g, b] = framed.at(32, 32);
    record(
      "an identity chain leaves the frame alone",
      near(r, 128, 2) && near(g, 128, 2) && near(b, 128, 2),
      `centre is ${r},${g},${b}, expected 128,128,128`,
    );
    framed.stop();
  }

  {
    const framed = await render(drawGrey, { passes: [{ fragment: QUARTER }] });
    const [r] = framed.at(32, 32);
    record("a pass actually runs over the frame", near(r, 32, 2), `centre is ${r}, expected 32`);
    framed.stop();
  }

  {
    // In the first pass the scene and the input are the same image, so their
    // difference is black. Amplified eightfold, any disagreement shows.
    const framed = await render(drawGrey, { passes: [{ fragment: DIFFERENCE }] });
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
    const framed = await render(drawGrey, {
      passes: [{ fragment: WRECK }, { fragment: WRECK }, { fragment: FROM_SCENE }],
    });
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
    const framed = await render(drawGrey, {
      passes: [{ fragment: SAMPLE_RAMP, textures: { u_ramp: rampTexture() } }],
    });
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
    const framed = await render(drawGrey, {
      passes: [{ fragment: QUARTER }],
      overlay: () => {
        noStroke();
        fill("#808080");
        rect(SIZE / 2, 0, SIZE / 2, SIZE);
      },
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
    const framed = await render(drawGrey, { passes: [{ fragment: HALF_ALPHA }] });
    const alpha = framed.at(32, 32)[3];
    record(
      "a pass owns the alpha it writes",
      near(alpha, 128, 4),
      `alpha is ${alpha}, expected 128`,
    );
    framed.stop();
  }

  return list.checks;
}
