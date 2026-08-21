/**
 * A single frame, drawn entirely in setup with no draw loop.
 * Tests: the draw-less path, lines, strokes, seeded reproducibility.
 */
import { sketch, type SketchContext, type SketchHandle } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

export function staticPoster(parent: HTMLElement): SketchHandle {
  return sketch({ backend: webgl2(), width: 600, height: 600, parent, seed: 11 }, (s: SketchContext) => {
    s.background('oklch(0.95 0.01 90)');

    // Ruled lines.
    s.stroke('oklch(0.3 0.05 250 / 0.5)');
    for (let i = 0; i < 40; i++) {
      s.strokeWeight(s.random.range(0.5, 3));
      const y = s.random.range(40, 560);
      s.line(40, y, 560, y + s.random.range(-25, 25));
    }

    // Discs, drawn inside a scoped style so nothing above leaks into them.
    s.with({ stroke: 'oklch(0.2 0.04 260)', strokeWeight: 2.5 }, () => {
      for (let i = 0; i < 14; i++) {
        s.fill(`oklch(${s.random.range(0.5, 0.8)} 0.17 ${s.random.range(20, 320)} / 0.85)`);
        s.circle(s.random.range(90, 510), s.random.range(90, 510), s.random.range(40, 150));
      }
    });

    // The stroke set before `with` is still in effect here.
    s.noFill();
    s.rect(30, 30, 540, 540);

    // No draw function: one frame, then done.
  });
}
