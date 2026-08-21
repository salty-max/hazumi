/**
 * Nested rotating frames.
 * Tests: the transform stack, push/pop nesting, scoped `with`.
 */
import { sketch, type SketchContext, type SketchHandle } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

export function orbits(parent: HTMLElement): SketchHandle {
  return sketch({ backend: webgl2(), width: 600, height: 600, parent }, () => {
    return ({ background, push, pop, translate, rotate, circle, fill, stroke,
              strokeWeight, width, height, t }: SketchContext) => {
      background('oklch(0.16 0.02 250)');

      push();
      translate(width / 2, height / 2);

      for (let ring = 1; ring <= 5; ring++) {
        push();
        rotate(t * (0.4 / ring) * (ring % 2 === 0 ? -1 : 1));
        const count = ring * 3;
        for (let i = 0; i < count; i++) {
          rotate((Math.PI * 2) / count);
          push();
          translate(ring * 48, 0);
          fill(`oklch(${0.55 + ring * 0.06} 0.16 ${180 + ring * 30})`);
          stroke('oklch(0.95 0.02 250 / 0.5)');
          strokeWeight(1.5);
          circle(0, 0, 26 - ring * 2);
          pop();
        }
        pop();
      }
      pop();
    };
  });
}
