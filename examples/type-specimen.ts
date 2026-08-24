/**
 * A specimen, set in a distance field.
 *
 * Tests: glyph layout, alignment, per-glyph measurement, the second render
 * pipeline, and whether the field actually stays crisp as the size climbs.
 *
 * The atlas is rasterised once, at one size. Everything here is drawn from that
 * same set of glyphs — the two-hundred-pixel pair at the centre and the
 * eight-pixel line under it — which is the claim worth checking: if the field
 * were wrong, the big one would show it first, and if the layout were wrong,
 * the small one would.
 *
 * The ring is set a glyph at a time. Each letter advances the pen by its own
 * measured width, turned into an angle, which is the same arithmetic a
 * justified line does and the reason `textWidth` is on the context at all.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Align,
  Baseline,
  background,
  fill,
  line,
  pop,
  push,
  rotate,
  stroke,
  strokeWeight,
  text,
  textAlign,
  textFont,
  textSize,
  textWidth,
  translate,
} from "hazumi/draw";
import { screen, time } from "hazumi/scene";

const FACE = "Bricolage Grotesque, sans-serif";
/**
 * Long enough to close the circle.
 *
 * A ring of type that runs out halfway round reads as a bug rather than as a
 * decision, so the phrase is repeated until it wraps; the seam moves with the
 * rotation and nobody finds it.
 */
const PHRASE = "HANDGLOVES · SET ONCE IN A DISTANCE FIELD · DRAWN AT ANY SIZE · ";
const RING = PHRASE + PHRASE;
const LADDER = [8, 12, 17, 24, 33] as const;
const INK = "oklch(0.95 0.02 90)";
const DIM = "oklch(0.62 0.03 260)";
const ACCENT = "oklch(0.72 0.19 40)";

export function typeSpecimen(parent: HTMLElement): HazumiApp {
  return start(
    // The atlas is rasterised at 128 rather than the default 48, and that is
    // the whole reason the big pair looks like type rather than like a
    // staircase. The field carries the edge to the precision of the raster it
    // was measured from, so a glyph set at 210 pixels out of a 48-pixel atlas
    // steps a texel at a time down every diagonal. Costs a larger texture,
    // which is the trade a title card should make and body text should not.
    { backend: webgl2({ text: { fontSize: 128 } }), width: 600, height: 600, parent },
    {
      draw: (): void => {
        background("oklch(0.14 0.02 265)");
        textFont(FACE);

        push();
        translate(screen.width / 2, screen.height / 2);

        // The ring, a glyph at a time.
        const radius = 246;
        textSize(19);
        textAlign(Align.Center, Baseline.Middle);
        fill(DIM);
        let angle = time.elapsed * 0.12;
        for (const character of RING) {
          const advance = textWidth(character);
          angle += advance / (2 * radius);
          push();
          rotate(angle);
          translate(0, -radius);
          text(character, 0, 0);
          pop();
          angle += advance / (2 * radius);
        }

        // The pair, as large as the frame will take it. One atlas, one glyph
        // each, two hundred pixels of it.
        textSize(210);
        textAlign(Align.Center, Baseline.Middle);
        fill(ACCENT);
        text("Aa", 0, -46);

        // The ladder, tight, so the small end is right under the large one.
        textAlign(Align.Center, Baseline.Alphabetic);
        fill(INK);
        let y = 96;
        for (const size of LADDER) {
          textSize(size);
          text("Handgloves 0123", 0, y);
          y += size * 1.55;
        }

        // A rule and the face's own name, measured rather than guessed.
        textSize(13);
        const label = "Bricolage Grotesque";
        const width = textWidth(label);
        stroke(DIM);
        strokeWeight(1);
        line(-width / 2 - 18, 208, -width / 2 - 8, 208);
        line(width / 2 + 8, 208, width / 2 + 18, 208);
        fill(DIM);
        text(label, 0, 212);

        textAlign(Align.Left, Baseline.Alphabetic);
        pop();
      },
    },
  );
}
