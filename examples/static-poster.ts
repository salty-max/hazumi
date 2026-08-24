/**
 * A print, run once.
 *
 * Tests: noLoop, lines, strokes, seeded reproducibility.
 *
 * Two inks and a paper, in the manner of a risograph: each ink is laid down as
 * its own pass, and the second is offset from the first by a couple of
 * millimetres because that is what a second pass through a drum actually does.
 * The misregistration is the look — take it out and the whole thing goes flat.
 *
 * Nothing here moves. The scene stops its own loop after one frame and the
 * seed decides the rest, so this exact sheet comes off the press every time.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Align,
  Baseline,
  background,
  circle,
  fill,
  line,
  noFill,
  noStroke,
  rect,
  stroke,
  strokeWeight,
  text,
  textAlign,
  textFont,
  textSize,
} from "hazumi/draw";
import { noLoop, random } from "hazumi/scene";

/** Ink one: a deep blue that carries the structure. */
const BLUE = "oklch(0.42 0.16 265";
/** Ink two: the warm one, laid down second and slightly out of register. */
const RED = "oklch(0.62 0.21 32";
const PAPER = "oklch(0.93 0.02 88)";

/** How far the second pass sits out of register, in pixels. */
const SLIP_X = 4;
const SLIP_Y = -3;

/**
 * One ink pass.
 *
 * The same drawing runs twice, offset and in a different colour, which is the
 * cheapest honest way to say "two plates" — and it means the composition is
 * written once rather than once per ink.
 *
 * Only the big shapes go through here. Type at fifteen pixels does not survive
 * four pixels of misregistration, and a real shop would not put it through the
 * second drum either; it is printed once, in the blue, below.
 */
function pass(ink: string, dx: number, dy: number): void {
  // The disc, as a halftone: dot size falls off from a light source, which is
  // how a screen print makes a gradient out of solid ink.
  noStroke();
  const cx = 300 + dx;
  const cy = 248 + dy;
  const discRadius = 162;
  for (let y = cy - discRadius; y <= cy + discRadius; y += 9) {
    for (let x = cx - discRadius; x <= cx + discRadius; x += 9) {
      if (Math.hypot(x - cx, y - cy) > discRadius) continue;
      // Lit from the top left: nearly bare paper there, solid ink opposite.
      const lit =
        ((x - cx + discRadius) / (discRadius * 2)) * 0.45 +
        ((y - cy + discRadius) / (discRadius * 2)) * 0.55;
      const size = 0.6 + lit ** 1.5 * 8.4;
      fill(`${ink} / 0.85)`);
      circle(x + random.range(-0.6, 0.6), y + random.range(-0.6, 0.6), size);
    }
  }

  // Three rules across the sheet, one heavy.
  stroke(`${ink} / 0.9)`);
  for (const [i, y] of [122, 430, 438].entries()) {
    strokeWeight(i === 1 ? 7 : 1.5);
    line(48 + dx, y + dy, 552 + dx, y + dy);
  }

  // The wordmark. Big enough that the slip reads as colour rather than blur.
  textFont("Bricolage Grotesque, sans-serif");
  fill(`${ink} / 0.92)`);
  textAlign(Align.Center, Baseline.Alphabetic);
  textSize(84);
  text("HAZUMI", 300 + dx, 106 + dy);
  textAlign(Align.Left, Baseline.Alphabetic);

  // A register bar down the foot of the sheet.
  strokeWeight(2);
  for (let i = 0; i < 18; i++) {
    const x = 48 + i * 28 + dx;
    line(x, 512 + dy, x, 512 + dy + random.range(6, 30));
  }
}

export function staticPoster(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 11 }, () => {
    noLoop();

    return {
      draw: (): void => {
        background(PAPER);
        pass(BLUE, 0, 0);
        pass(RED, SLIP_X, SLIP_Y);

        // Small type, printed once. Legibility is worth more than the effect
        // at this size, and the shop would agree.
        textFont("Bricolage Grotesque, sans-serif");
        fill(`${BLUE} / 0.95)`);
        textAlign(Align.Center, Baseline.Alphabetic);
        textSize(16);
        text("A TYPED 2D GRAPHICS LIBRARY", 300, 474);
        fill(`${RED} / 0.95)`);
        textSize(11);
        text("ONE BUFFER  ·  FOUR BACKENDS  ·  NO PRELOAD", 300, 494);
        textAlign(Align.Left, Baseline.Alphabetic);

        // Paper grain, over both plates: the sheet, not the ink.
        noStroke();
        for (let i = 0; i < 2600; i++) {
          fill(`oklch(0.35 0.02 80 / ${random.range(0.03, 0.1)})`);
          circle(random.range(0, 600), random.range(0, 600), random.range(0.6, 1.8));
        }

        // Trim marks.
        noFill();
        stroke("oklch(0.35 0.03 80 / 0.5)");
        strokeWeight(1);
        rect(28, 28, 544, 544);
      },
    };
  });
}
