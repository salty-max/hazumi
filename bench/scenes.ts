/**
 * Scenes rendered through both backends and compared pixel by pixel.
 *
 * Each one isolates something the two renderers could plausibly disagree
 * about: antialiasing, stroke geometry, painter order, transform composition,
 * or blend state.
 */
import { Blend, type CommandBuffer } from '@matter/graphics';

export interface Scene {
  readonly name: string;
  readonly draw: (b: CommandBuffer) => void;
  /**
   * Mean per-channel difference tolerated, 0-255. Antialiased edges never
   * match bit-for-bit across two rasterisers, so the bar is "no visible
   * difference", not "identical".
   */
  readonly tolerance?: number;
}

export const SCENES: readonly Scene[] = [
  {
    name: 'filled circles',
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.9, 0.2, 0.3, 1);
      b.circle(150, 150, 90);
      b.setFill(0.2, 0.5, 0.9, 1);
      b.circle(320, 200, 60);
      b.setFill(0.1, 0.8, 0.4, 1);
      b.circle(220, 330, 45);
    },
  },
  {
    name: 'filled rects',
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.85, 0.6, 0.1, 1);
      b.rect(40, 40, 180, 100);
      b.setFill(0.3, 0.3, 0.8, 1);
      b.rect(240, 120, 90, 240);
      b.setFill(0.9, 0.9, 0.9, 1);
      b.rect(60, 260, 140, 60);
    },
  },
  {
    name: 'non-square rect strokes',
    // The case that fails if half-extents are folded into the affine: the
    // stroke comes out thicker on two sides than the other two.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.2, 0.2, 0.25, 1);
      b.setStroke(1, 0.85, 0.2, 1);
      b.setStrokeWidth(10);
      b.rect(50, 60, 300, 60);
      b.rect(60, 180, 60, 220);
      b.rect(200, 200, 160, 160);
    },
  },
  {
    name: 'circle strokes',
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.15, 0.35, 0.6, 1);
      b.setStroke(1, 1, 1, 1);
      b.setStrokeWidth(8);
      b.circle(140, 150, 80);
      b.setStrokeWidth(2);
      b.circle(310, 160, 55);
      b.setStrokeWidth(20);
      b.circle(220, 320, 70);
    },
  },
  {
    name: 'lines',
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setStroke(0.95, 0.4, 0.7, 1);
      for (let i = 0; i < 12; i++) {
        b.setStrokeWidth(1 + i);
        b.line(40, 30 + i * 30, 360, 60 + i * 22);
      }
    },
  },
  {
    name: 'overlapping transparency',
    // Painter order is the whole point: any reordering changes the result.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(1, 0.2, 0.2, 0.5);
      b.circle(160, 180, 90);
      b.setFill(0.2, 1, 0.2, 0.5);
      b.circle(240, 180, 90);
      b.setFill(0.2, 0.2, 1, 0.5);
      b.circle(200, 260, 90);
    },
  },
  {
    name: 'interleaved blend modes',
    // Alternating pipelines: merging non-adjacent instances would reorder these.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      for (let i = 0; i < 10; i++) {
        b.setBlend(i % 2 === 0 ? Blend.Normal : Blend.Add);
        b.setFill(0.3 + i * 0.06, 0.4, 0.9 - i * 0.05, 0.55);
        b.circle(80 + i * 25, 200 + Math.sin(i) * 60, 55);
      }
    },
  },
  {
    name: 'transform stack',
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.9, 0.5, 0.1, 1);
      b.push();
      b.translate(200, 200);
      for (let i = 0; i < 8; i++) {
        b.rotate(Math.PI / 4);
        b.push();
        b.translate(90, 0);
        b.rect(-20, -20, 40, 40);
        b.pop();
      }
      b.pop();
      // Must be unaffected by the transforms above.
      b.setFill(0.2, 0.7, 0.9, 1);
      b.circle(60, 60, 30);
    },
  },
  {
    name: 'uniform scale with stroke',
    // Stroke width is in user units, so it scales with the transform in both
    // backends. Anisotropic scale is a documented divergence and not tested.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.25, 0.25, 0.3, 1);
      b.setStroke(0.9, 0.9, 0.3, 1);
      b.setStrokeWidth(6);
      b.push();
      b.translate(200, 200);
      b.scale(2, 2);
      b.circle(0, 0, 50);
      b.rect(-70, -70, 40, 40);
      b.pop();
    },
  },
  {
    name: 'ellipses',
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.9, 0.45, 0.2, 1);
      b.ellipse(140, 140, 100, 55);
      b.setFill(0.3, 0.7, 0.95, 1);
      b.ellipse(290, 200, 45, 110);
      b.setStroke(1, 1, 1, 1);
      b.setStrokeWidth(6);
      b.ellipse(200, 310, 130, 70);
    },
    // The ellipse SDF is an approximation, but it still clears the default
    // tolerance — no override, so a regression here fails like anything else.
  },
  {
    name: 'translucent background over content',
    // The trail idiom: a translucent background must blend over what is
    // already there rather than clear it.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(1, 0.3, 0.2, 1);
      b.circle(160, 200, 90);
      b.setFill(0.2, 0.9, 0.4, 1);
      b.circle(260, 200, 90);
      b.background(0.05, 0.05, 0.15, 0.6);
      b.setFill(1, 1, 1, 1);
      b.circle(200, 300, 50);
    },
  },
  {
    name: 'push/pop restores style',
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.9, 0.3, 0.3, 1);
      b.push();
      b.setFill(0.3, 0.9, 0.3, 1);
      b.setStrokeWidth(12);
      b.setStroke(1, 1, 1, 1);
      b.circle(140, 200, 70);
      b.pop();
      // Back to red, no stroke.
      b.circle(300, 200, 70);
    },
  },
];
