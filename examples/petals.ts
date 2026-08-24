/**
 * A rosette built from cubic curves, four layers deep.
 *
 * Tests: the shape API, curve flattening, stencil fill under the transform
 * stack, and stroked paths.
 *
 * Every petal is two bezier segments — out along one side, back along the
 * other — so the interesting part is not the curve but what layering them
 * does. Each ring turns at its own rate and in its own direction, which means
 * the figure never repeats within a viewing; the shape you see at any moment
 * is one that will not come back for a very long time.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Blend,
  background,
  beginShape,
  bezierVertex,
  blendMode,
  circle,
  endShape,
  fill,
  noFill,
  noStroke,
  pop,
  push,
  rotate,
  stroke,
  strokeWeight,
  translate,
  vertex,
} from "hazumi/draw";
import { screen, time } from "hazumi/scene";

interface Ring {
  /** How many petals go round. */
  readonly count: number;
  /** How far out they reach, before breathing. */
  readonly reach: number;
  /** Half-width at the widest point, as a fraction of the reach. */
  readonly girth: number;
  /** Turns per second, signed. Neighbouring rings turn opposite ways. */
  readonly spin: number;
  readonly hue: number;
  readonly lightness: number;
  readonly alpha: number;
}

const RINGS: readonly Ring[] = [
  { count: 15, reach: 250, girth: 0.16, spin: 0.05, hue: 300, lightness: 0.42, alpha: 0.5 },
  { count: 11, reach: 205, girth: 0.22, spin: -0.09, hue: 255, lightness: 0.5, alpha: 0.6 },
  { count: 8, reach: 155, girth: 0.3, spin: 0.15, hue: 200, lightness: 0.6, alpha: 0.68 },
  { count: 6, reach: 100, girth: 0.4, spin: -0.24, hue: 90, lightness: 0.72, alpha: 0.8 },
];

export function petals(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2(), width: 600, height: 600, parent, seed: 4 },
    {
      draw: (): void => {
        background("oklch(0.1 0.03 290)");

        push();
        translate(screen.width / 2, screen.height / 2);

        for (const [layer, ring] of RINGS.entries()) {
          push();
          rotate(time.elapsed * ring.spin * Math.PI * 2);
          for (let i = 0; i < ring.count; i++) {
            push();
            rotate((i / ring.count) * Math.PI * 2);

            // Each petal breathes on its own phase, so the ring ripples round
            // rather than pulsing as one piece.
            const breath = Math.sin(time.elapsed * 1.1 + i * 0.8 + layer) * 0.09;
            const reach = ring.reach * (1 + breath);
            const wide = reach * ring.girth;
            const hue = (ring.hue + i * (360 / ring.count) * 0.35 + time.elapsed * 12) % 360;

            fill(`oklch(${ring.lightness} 0.2 ${hue} / ${ring.alpha})`);
            stroke(`oklch(0.96 0.05 ${hue} / 0.5)`);
            strokeWeight(1.2);

            beginShape();
            vertex(0, 0);
            bezierVertex(reach * 0.22, -wide, reach * 0.72, -wide * 1.15, reach, 0);
            bezierVertex(reach * 0.72, wide * 1.15, reach * 0.22, wide, 0, 0);
            endShape(true);

            pop();
          }
          pop();
        }

        // Filigree over the top: curves with no fill at all, which is the
        // other half of what the shape API has to get right.
        noFill();
        for (let strand = 0; strand < 3; strand++) {
          stroke(`oklch(0.94 0.1 ${(200 + strand * 60) % 360} / 0.55)`);
          strokeWeight(2 - strand * 0.5);
          beginShape();
          vertex(0, 0);
          for (let i = 0; i < 8; i++) {
            const r0 = i * 30;
            const r1 = (i + 1) * 30;
            const a = i * 1.6 + time.elapsed * (0.3 + strand * 0.12) + strand * 2.1;
            bezierVertex(
              Math.cos(a) * r0,
              Math.sin(a) * r0,
              Math.cos(a + 0.9) * r1,
              Math.sin(a + 0.9) * r1,
              Math.cos(a + 1.6) * r1,
              Math.sin(a + 1.6) * r1,
            );
          }
          endShape();
        }

        // A light at the centre, so the eye has somewhere to land.
        noStroke();
        blendMode(Blend.Add);
        fill("oklch(0.9 0.14 90 / 0.14)");
        circle(0, 0, 150);
        fill("oklch(0.97 0.1 95 / 0.5)");
        circle(0, 0, 34);
        blendMode(Blend.Normal);

        pop();
      },
    },
  );
}
