/**
 * Scenes rendered through both backends and compared pixel by pixel.
 *
 * Each one isolates something the two renderers could plausibly disagree
 * about: antialiasing, stroke geometry, painter order, transform composition,
 * or blend state.
 */
import { Blend, type CommandBuffer, type ImageSource } from "@hazumi/graphics";

/**
 * A 2x2 sheet with a distinct colour per quadrant, built once.
 *
 * Distinct colours are what make a wrong sub-rectangle visible: a size or flip
 * error picks a different quadrant rather than looking subtly off.
 *
 * Each cell is deliberately asymmetric. An earlier version filled them with
 * flat colour, which meant a cell rendered upside down still sampled the same
 * colour everywhere and diffed at zero -- the scene could confirm *which* cell
 * was picked but not which way up it landed, and a real vertical flip shipped
 * underneath it. The marker sits in one corner so orientation has to be right.
 */
function paintSheet(ctx: CanvasRenderingContext2D): void {
  const quadrants: ReadonlyArray<[number, number, string]> = [
    [0, 0, "#ff2d2d"],
    [32, 0, "#22c55e"],
    [0, 32, "#3b82f6"],
    [32, 32, "#eab308"],
  ];
  for (const [x, y, colour] of quadrants) {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, 32, 32);
    // Top-left marker and a bottom bar: mirroring the cell in either axis
    // moves both, so a flip cannot cancel itself out.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 3, y + 3, 8, 8);
    ctx.fillStyle = "#111111";
    ctx.fillRect(x + 3, y + 26, 26, 3);
  }
}

function drawSheet(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  paintSheet(c.getContext("2d") as CanvasRenderingContext2D);
  return c;
}

let sheet: ImageSource | null = null;
function testSheet(): ImageSource {
  if (sheet === null) sheet = drawSheet();
  return sheet;
}

/**
 * The same picture as an ImageBitmap.
 *
 * This is not redundant with the canvas above. WebGL honours
 * UNPACK_FLIP_Y_WEBGL for a canvas or <img> but IGNORES it for an ImageBitmap,
 * so the two source types can land in the texture with opposite orientation --
 * and `loadImage()` hands scenes an ImageBitmap. Testing only the canvas is
 * what let upside-down sprites through.
 */
let bitmap: ImageSource | null = null;
function bitmapSheet(): ImageSource {
  if (bitmap === null) throw new Error("call prepareScenes() before rendering");
  return bitmap;
}

/** Decode the async sources the scenes need. Call once, before rendering. */
export async function prepareScenes(): Promise<void> {
  bitmap = await createImageBitmap(drawSheet());
}

function drawFrames(b: CommandBuffer, img: ImageSource): void {
  b.background(0, 0, 0, 1);
  const cells: ReadonlyArray<[number, number]> = [
    [0, 0],
    [32, 0],
    [0, 32],
    [32, 32],
  ];
  for (const [i, [sx, sy]] of cells.entries()) {
    const dx = 40 + (i % 2) * 170;
    const dy = 40 + Math.floor(i / 2) * 170;
    b.imageRegion(img, dx, dy, 150, 150, sx, sy, 32, 32);
  }
}

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
    name: "filled circles",
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
    name: "filled rects",
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
    name: "non-square rect strokes",
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
    name: "circle strokes",
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
    name: "lines",
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
    name: "overlapping transparency",
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
    name: "interleaved blend modes",
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
    name: "transform stack",
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
    name: "camera world and screen space",
    // The world view is a pan/zoom affine. resetTransform is the HUD boundary;
    // the final world shape proves the view can be restored afterwards.
    draw: (b) => {
      b.background(0.04, 0.05, 0.09, 1);
      b.translate(200, 200);
      b.scale(2, 2);
      b.translate(-100, -80);
      b.setFill(0.2, 0.65, 0.95, 1);
      b.circle(100, 80, 45);

      b.resetTransform();
      b.setFill(0.95, 0.75, 0.2, 1);
      b.rect(16, 16, 120, 32);

      b.translate(200, 200);
      b.scale(2, 2);
      b.translate(-100, -80);
      b.setFill(0.95, 0.3, 0.45, 1);
      b.circle(165, 110, 22);
    },
  },
  {
    name: "uniform scale with stroke",
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
    name: "ellipses",
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
    name: "translucent background over content",
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
    name: "opaque background discards paths",
    // Clearing batches must rewind the path vertex cursor too. Otherwise the
    // next batch starts at zero but reads geometry queued before the clear.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(1, 0.1, 0.2, 1);
      b.beginPath();
      b.moveTo(20, 20);
      b.lineTo(380, 20);
      b.lineTo(200, 380);
      b.closePath();
      b.fillPath();

      b.background(0.05, 0.08, 0.15, 1);
      b.setFill(0.2, 0.9, 0.55, 1);
      b.beginPath();
      b.moveTo(100, 100);
      b.lineTo(300, 100);
      b.lineTo(300, 300);
      b.lineTo(100, 300);
      b.closePath();
      b.fillPath();
    },
  },
  {
    name: "filled bezier path",
    // The abstraction test made visual: curves reach the GPU as control
    // points and are flattened there, while SVG exports them as curves.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.9, 0.5, 0.2, 1);
      b.beginPath();
      b.moveTo(60, 300);
      b.cubicTo(60, 120, 180, 60, 240, 160);
      b.cubicTo(300, 60, 360, 140, 340, 300);
      b.closePath();
      b.fillPath();
    },
  },
  {
    name: "path with a hole",
    // Two contours winding oppositely: the nonzero rule must leave the inner
    // one empty, which is what the stencil pass reproduces.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0.3, 0.75, 0.95, 1);
      b.beginPath();
      b.moveTo(80, 80);
      b.lineTo(320, 80);
      b.lineTo(320, 320);
      b.lineTo(80, 320);
      b.closePath();
      b.moveTo(160, 240);
      b.lineTo(240, 240);
      b.lineTo(240, 160);
      b.lineTo(160, 160);
      b.closePath();
      b.fillPath();
    },
  },
  {
    name: "stroked path",
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(0, 0, 0, 0);
      b.setStroke(0.95, 0.85, 0.3, 1);
      b.setStrokeWidth(9);
      b.beginPath();
      b.moveTo(50, 200);
      b.quadraticTo(140, 40, 200, 200);
      b.quadraticTo(260, 360, 350, 200);
      b.strokePath();
    },
    // Joins differ in principle — the GPU expands round joins on the CPU while
    // Canvas2D uses its miter default — but at these widths the seam is well
    // inside the standard tolerance, so no override.
  },
  {
    name: "spritesheet frames",
    // Every quadrant drawn from one texture, from a canvas source.
    draw: (b) => drawFrames(b, testSheet()),
  },
  {
    name: "spritesheet frames from an ImageBitmap",
    // The same frames from the source type `loadImage()` actually returns.
    draw: (b) => drawFrames(b, bitmapSheet()),
  },
  {
    name: "whole image",
    // The non-region path, which must agree with the region path above.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.image(testSheet(), 40, 40, 200, 200);
      b.image(bitmapSheet(), 260, 40, 200, 200);
    },
  },
  {
    name: "text",
    // The one pipeline with no analytic distance: glyphs sample an SDF atlas
    // built at runtime, so this is the only scene that can catch the atlas
    // being read wrong. A runtime SDF and the browser's own hinted rasteriser
    // differ along every stem, but by less than a point in practice — the extra
    // headroom is for fonts differing between machines, not for slop.
    draw: (b) => {
      b.background(0, 0, 0, 1);
      b.setFill(1, 1, 1, 1);
      b.setFont("sans-serif");
      b.setTextSize(34);
      b.text(30, 90, "Hamburgefonstiv 0123");
      b.setTextSize(18);
      b.text(30, 150, "the quick brown fox jumps");
    },
    tolerance: 6,
  },
  {
    name: "push/pop restores style",
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
