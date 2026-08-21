/**
 * Bezier shapes: petals built from cubic curves, rotated into a rosette.
 * Tests: the shape API, curve flattening, stencil fill with the transform
 * stack, and stroked paths.
 */
import { sketch, type SketchContext, type SketchHandle } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

export function petals(parent: HTMLElement): SketchHandle {
  return sketch({ backend: webgl2(), width: 600, height: 600, parent, seed: 4 }, () => {
    return ({ background, beginShape, vertex, bezierVertex, endShape,
              push, pop, translate, rotate, fill, stroke, strokeWeight,
              width, height, t }: SketchContext) => {
      background('oklch(0.13 0.02 280)');

      push();
      translate(width / 2, height / 2);

      const petalCount = 9;
      for (let i = 0; i < petalCount; i++) {
        push();
        rotate((i / petalCount) * Math.PI * 2 + t * 0.15);

        const reach = 200 + Math.sin(t * 1.3 + i) * 30;
        fill(`oklch(0.6 0.19 ${(i * 40 + t * 30) % 360} / 0.75)`);
        stroke('oklch(0.95 0.03 90 / 0.6)');
        strokeWeight(1.5);

        // One petal: out along one side, back along the other.
        beginShape();
        vertex(0, 0);
        bezierVertex(70, -40, reach * 0.7, -60, reach, 0);
        bezierVertex(reach * 0.7, 60, 70, 40, 0, 0);
        endShape(true);

        pop();
      }

      // A stroked spiral over the top, to show curves without a fill.
      fill('oklch(0 0 0 / 0)');
      stroke('oklch(0.9 0.12 200 / 0.8)');
      strokeWeight(2.5);
      beginShape();
      vertex(0, 0);
      for (let i = 0; i < 7; i++) {
        const r0 = i * 26;
        const r1 = (i + 1) * 26;
        const a = i * 1.6 + t * 0.4;
        bezierVertex(
          Math.cos(a) * r0, Math.sin(a) * r0,
          Math.cos(a + 0.9) * r1, Math.sin(a + 0.9) * r1,
          Math.cos(a + 1.6) * r1, Math.sin(a + 1.6) * r1,
        );
      }
      endShape();

      pop();
    };
  });
}
