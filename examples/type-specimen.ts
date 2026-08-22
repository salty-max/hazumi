/**
 * Text at a range of sizes, drawn through the SDF atlas.
 * Tests: glyph layout, alignment, the second render pipeline, and whether the
 * distance field actually stays crisp as the size climbs.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Align,
  Baseline,
  background,
  circle,
  fill,
  text,
  textAlign,
  textFont,
  textSize,
} from "hazumi/draw";
import { screen, time } from "hazumi/scene";

export function typeSpecimen(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2(), width: 600, height: 600, parent },
    {
      draw: (): void => {
        background("oklch(0.96 0.01 90)");
        textFont("Bricolage Grotesque, sans-serif");

        fill("oklch(0.25 0.04 260)");
        textAlign(Align.Left, Baseline.Alphabetic);
        for (const [i, size] of [12, 18, 26, 38, 56].entries()) {
          textSize(size);
          text("Handgloves", 40, 90 + i * 78);
        }

        // Centred, and moving — proves layout is recomputed, not cached wrong.
        textAlign(Align.Center, Baseline.Middle);
        textSize(30);
        fill("oklch(0.55 0.2 25)");
        text("centred", screen.width / 2 + Math.sin(time.elapsed) * 90, 520);

        // Shapes and glyphs interleaved: each switch is a pipeline change, so
        // this is also a check that batching does not reorder them.
        fill("oklch(0.6 0.15 200 / 0.8)");
        circle(500, 100, 60);
        fill("oklch(0.25 0.04 260)");
        textAlign(Align.Right, Baseline.Alphabetic);
        textSize(20);
        text("over", 540, 106);
      },
    },
  );
}
