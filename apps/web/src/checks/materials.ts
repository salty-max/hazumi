/**
 * Materials: does the effect happen, and does the batch survive it.
 *
 * Both halves matter. A flash that lands on the wrong sprite is a bug you can
 * see; a flash that quietly ends the batch is a bug you cannot, and it is the
 * one that would make the whole design pointless — the reason the vocabulary
 * is fixed and packed into the instance is so that a crowd of sprites wearing
 * different materials stays a single draw call. So one of these checks counts
 * draw calls, and it is the load-bearing one.
 *
 * Sprites are built here rather than loaded, at sizes small enough to name
 * every texel: a check that says "the ring one texel out is green" should be
 * standing on a texel someone chose.
 */
import { image, material, noMaterial, background, tint } from "hazumi/draw";
import { CheckList, near, render, type Check } from "./harness";

/** How many screen pixels one source texel covers, in these checks. */
const ZOOM = 6;

/**
 * A sprite with a hollow margin: `art` texels of solid colour, centred in a
 * square of `size`, everything else transparent.
 *
 * The margin is the room an outline needs. Art that runs to the edge of its
 * frame has nowhere to put a border, which is a real limit of the material
 * rather than a shortcut taken here — see the note on `Material`.
 */
function sprite(size: number, art: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D context for the sprite");
  const inset = (size - art) / 2;
  context.fillStyle = color;
  context.fillRect(inset, inset, art, art);
  return canvas;
}

/** Draw one sprite filling the frame, at a whole number of pixels per texel. */
function drawSprite(source: HTMLCanvasElement): void {
  background("#000000");
  image(source, 0, 0, source.width * ZOOM, source.height * ZOOM);
}

export async function materialChecks(): Promise<readonly Check[]> {
  const list = new CheckList();
  const record = list.record.bind(list);

  // 10x10 with a 6x6 block of red: two texels of margin all round, which is
  // room for an outline of one or two and a check that can tell them apart.
  const red = sprite(10, 6, "#ff0000");
  const centre = 5 * ZOOM;

  {
    // Widening the instance and rewriting the image shader's premultiply is
    // the sort of change that leaves every sprite a shade off. A plain sprite
    // must come back exactly the colour it was drawn in.
    const framed = await render(() => {
      noMaterial();
      drawSprite(red);
    });
    const [r, g, b, a] = framed.at(centre, centre);
    record(
      "a sprite with no material is untouched",
      near(r, 255, 2) && g <= 2 && b <= 2 && near(a, 255, 2),
      `centre is ${r},${g},${b},${a}, expected 255,0,0,255`,
    );
    framed.stop();
  }

  {
    const framed = await render(() => {
      material({ type: "flash", color: "#00ff00", amount: 1 });
      drawSprite(red);
    });
    const [r, g, b] = framed.at(centre, centre);
    record(
      "a full flash replaces the sprite's colour",
      r <= 2 && near(g, 255, 2) && b <= 2,
      `centre is ${r},${g},${b}, expected 0,255,0`,
    );
    framed.stop();
  }

  {
    // Half way from red to white is (255, 128, 128). A lerp that ran on
    // premultiplied colour, or one that squared the amount, misses this.
    const framed = await render(() => {
      material({ type: "flash", color: "#ffffff", amount: 0.5 });
      drawSprite(red);
    });
    const [r, g, b] = framed.at(centre, centre);
    record(
      "a half flash is half way there",
      near(r, 255, 3) && near(g, 128, 6) && near(b, 128, 6),
      `centre is ${r},${g},${b}, expected 255,128,128`,
    );
    framed.stop();
  }

  {
    const framed = await render(() => {
      material({ type: "outline", color: "#0000ff", width: 1 });
      drawSprite(red);
    });
    // The art spans texels 2..7. One texel out is 1.5 — inside the border —
    // and two out is 0.5, which a width of 1 must leave alone.
    //
    // Measured as colour rather than as alpha: the scene paints an opaque
    // background, so every pixel on the canvas comes back with alpha 255
    // whether a sprite reached it or not.
    const border = framed.at(Math.round(1.5 * ZOOM), centre);
    const outside = framed.at(Math.round(0.5 * ZOOM), centre);
    record(
      "an outline fills the empty texels beside the art",
      border[2] > 200 && border[0] <= 40 && outside[2] <= 40,
      `border is ${border.join(",")} (expected blue), two texels out is ${outside.join(",")} (expected the black background)`,
    );
    framed.stop();
  }

  {
    // The outline must stop at the art. Painting the sprite's own edge texel
    // would eat a pixel of the drawing, which on a 16x16 character is a lot.
    const framed = await render(() => {
      material({ type: "outline", color: "#0000ff", width: 2 });
      drawSprite(red);
    });
    const edge = framed.at(Math.round(2.5 * ZOOM), centre);
    record(
      "an outline does not paint over the art",
      near(edge[0], 255, 2) && edge[2] <= 40,
      `the sprite's edge texel is ${edge.join(",")}, expected red`,
    );
    framed.stop();
  }

  {
    // Nothing at 0, nothing left at 1. The second half is the one that catches
    // a threshold stopping at the noise maximum instead of past it.
    const intact = await render(() => {
      material({ type: "dissolve", amount: 0, scale: 4 });
      drawSprite(red);
    });
    const whole = intact.at(centre, centre);
    intact.stop();

    const gone = await render(() => {
      material({ type: "dissolve", amount: 1, scale: 4 });
      drawSprite(red);
    });
    // Sampled across the art rather than at one point: a dissolve is noise,
    // and one surviving texel is the failure this is looking for.
    let remaining = 0;
    for (let x = 3; x < 8; x++) {
      for (let y = 3; y < 8; y++) {
        // Red, not alpha: what is left behind is the opaque black background.
        if (gone.at(x * ZOOM, y * ZOOM)[0] > 40) remaining++;
      }
    }
    gone.stop();

    record(
      "a dissolve runs from whole to nothing",
      near(whole[0], 255, 2) && remaining === 0,
      `at 0 the centre is ${whole.join(",")} (expected red), at 1 ${remaining} of 25 texels survive`,
    );
  }

  {
    // A half-transparent sprite, flashed halfway to white.
    //
    // This is the check that knows whether the material stage runs on straight
    // alpha. The texture arrives premultiplied, so its red is already 0.5;
    // mixing that toward white gives 0.75 where mixing the real colour gives
    // 1.0, and the sprite comes out at 96,64,64 instead of 128,64,64. Opaque
    // sprites cannot tell the two apart, which is exactly why one here is not.
    const ghost = sprite(10, 6, "rgba(255, 0, 0, 0.5)");
    const framed = await render(() => {
      material({ type: "flash", color: "#ffffff", amount: 0.5 });
      drawSprite(ghost);
    });
    const [r, g, b] = framed.at(centre, centre);
    record(
      "the material stage runs on straight alpha",
      near(r, 128, 5) && near(g, 64, 5) && near(b, 64, 5),
      `centre is ${r},${g},${b}, expected 128,64,64`,
    );
    framed.stop();
  }

  {
    // The load-bearing one. Eight sprites, no two wearing the same material,
    // one texture, one blend mode — and therefore one draw call. If a material
    // ever becomes part of the batch key this reads 8 and says so.
    const framed = await render(() => {
      background("#000000");
      const wardrobe = [
        (): void => noMaterial(),
        (): void => material({ type: "flash", color: "#ffffff", amount: 1 }),
        (): void => material({ type: "flash", color: "#00ff00", amount: 0.25 }),
        (): void => material({ type: "outline", color: "#0000ff", width: 1 }),
        (): void => material({ type: "outline", color: "#ffff00", width: 2 }),
        (): void => material({ type: "dissolve", amount: 0.3, scale: 6 }),
        (): void => material({ type: "dissolve", amount: 0.6, edge: 0.2 }),
        (): void => noMaterial(),
      ];
      for (const [index, wear] of wardrobe.entries()) {
        wear();
        image(red, (index % 4) * 16, Math.floor(index / 4) * 16, 16, 16);
      }
    });
    record(
      "sprites wearing different materials still share one draw call",
      framed.drawCalls === 1,
      `eight sprites took ${framed.drawCalls} draw calls, expected 1`,
    );
    framed.stop();
  }

  {
    // Tint and material are separate stages, and the order matters: a flash
    // pushes the sprite toward white, then the tint multiplies. Half tint over
    // a full white flash is mid grey; a flash applied after the tint would
    // come back fully white and hide the tint entirely.
    const framed = await render(() => {
      tint("#808080");
      material({ type: "flash", color: "#ffffff", amount: 1 });
      drawSprite(red);
    });
    const [r, g, b] = framed.at(centre, centre);
    record(
      "a tint still multiplies what the material produced",
      near(r, 128, 6) && near(g, 128, 6) && near(b, 128, 6),
      `centre is ${r},${g},${b}, expected 128,128,128`,
    );
    framed.stop();
  }

  return list.checks;
}
