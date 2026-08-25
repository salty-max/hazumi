import { Align, Baseline, Blend, type ImageSource, type TextMetrics } from "@hazumi/graphics";
import { getActiveContext, NoActiveSceneError } from "./active-context";
import type { ColorLike } from "./color-cache";
import type { SpriteFrame } from "./spritesheet";
import type { Material, StyleOverrides } from "./context";

export { Align, Baseline, Blend, NoActiveSceneError };
export { oklch, rgb } from "@hazumi/color";
export type { ColorLike, Material, StyleOverrides };

/**
 * Fill the whole canvas, ignoring the current transform.
 *
 * Opaque backgrounds discard everything queued before them rather than
 * painting over it, so clearing at the top of `draw` costs nothing.
 */
export function background(color: ColorLike): void {
  getActiveContext().background(color);
}

/**
 * Interior colour for shapes and text. Accepts hex, CSS, `oklch()`, or a
 * parsed colour object; parsed strings are cached, so a literal in a hot loop
 * is fine.
 */
export function fill(color: ColorLike): void {
  getActiveContext().fill(color);
}

/** Set fill from display-referred 0–1 channels. No parse, no allocation. */
export function fillRgba(r: number, g: number, b: number, a: number): void {
  getActiveContext().fillRgba(r, g, b, a);
}

/** Draw shapes with no interior. Does not affect images — see `tint`. */
export function noFill(): void {
  getActiveContext().noFill();
}

/** Multiplier for images. Independent of fill so `noFill()` cannot hide a sprite. */
export function tint(color: ColorLike): void {
  getActiveContext().tint(color);
}

/** Set tint from display-referred 0–1 channels. No parse, no allocation. */
export function tintRgba(r: number, g: number, b: number, a: number): void {
  getActiveContext().tintRgba(r, g, b, a);
}

/** Opaque white — a no-op multiply. */
export function noTint(): void {
  getActiveContext().noTint();
}

/**
 * Wear an effect on following images and text.
 *
 * One of a fixed set — flash, outline, dissolve — because a material travels
 * in the instance data rather than in a program, which is what lets a hundred
 * sprites wearing different ones stay a single draw call.
 *
 * Ignored where `capabilities.materials` is false; the sprite draws plain.
 */
export function material(effect: Material): void {
  getActiveContext().material(effect);
}

/** Back to a plain sprite. */
export function noMaterial(): void {
  getActiveContext().noMaterial();
}

/** Outline colour for shapes, lines and points. */
export function stroke(color: ColorLike): void {
  getActiveContext().stroke(color);
}

/** Draw shapes with no outline at all. */
export function noStroke(): void {
  getActiveContext().noStroke();
}

/**
 * Outline width in user units, straddling the shape's edge.
 *
 * Also the diameter of a `point`, which is a degenerate line.
 */
export function strokeWeight(weight: number): void {
  getActiveContext().strokeWeight(weight);
}

/**
 * How following draws combine with what is already there.
 *
 * The one piece of style that is part of the batch key: changing it mid-frame
 * ends the current draw call, so group additive work rather than alternating.
 */
export function blendMode(mode: Blend): void {
  getActiveContext().blendMode(mode);
}

/**
 * Start a path. Feed it with `vertex`, `quadraticVertex` and `bezierVertex`,
 * then paint it with `endShape`.
 *
 * The buffer keeps the control points rather than a flattened polyline, so an
 * SVG export gets real curve commands and the GPU flattens at the resolution
 * it is actually drawing.
 */
export function beginShape(): void {
  getActiveContext().beginShape();
}

/** Straight line to a point. The first vertex of a shape opens the contour. */
export function vertex(x: number, y: number): void {
  getActiveContext().vertex(x, y);
}

/** Quadratic curve to `x, y`, bending toward the single control point. */
export function quadraticVertex(cx: number, cy: number, x: number, y: number): void {
  getActiveContext().quadraticVertex(cx, cy, x, y);
}

/** Cubic curve to `x, y`, with a control point for each end. */
export function bezierVertex(
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x: number,
  y: number,
): void {
  getActiveContext().bezierVertex(c1x, c1y, c2x, c2y, x, y);
}

/**
 * Paint the path with the current style. `close` joins the last point back to
 * the first, which a filled shape almost always wants.
 */
export function endShape(close?: boolean): void {
  getActiveContext().endShape(close);
}

/**
 * Draw an image, or one frame of a spritesheet.
 *
 * Optional `sx, sy, sw, sh` crop source pixels; on a frame they are relative
 * to that frame. Dest size comes first, same as p5 — a crop without an
 * explicit dest size uses `sw`/`sh`.
 */
export function image(
  source: ImageSource | SpriteFrame,
  x: number,
  y: number,
  width?: number,
  height?: number,
  sx?: number,
  sy?: number,
  sw?: number,
  sh?: number,
): void {
  getActiveContext().image(source, x, y, width, height, sx, sy, sw, sh);
}

/**
 * Font family for following text, as a CSS font stack.
 *
 * The renderer rasterises a distance-field atlas per family on first use, so
 * a scene that cycles through many fonts pays for many atlases.
 */
export function textFont(family: string): void {
  getActiveContext().textFont(family);
}

/**
 * Text size in user units.
 *
 * One atlas serves every size — that is what the distance field buys — but it
 * was measured at a fixed raster, so type set far above it softens. See
 * `webgl2({ text: { fontSize } })`.
 */
export function textSize(size: number): void {
  getActiveContext().textSize(size);
}

/**
 * Which point of the text the coordinates given to `text` refer to.
 *
 * Vertical defaults to the alphabetic baseline, which is where a typographer
 * would put it and not where a box-model layout would.
 */
export function textAlign(horizontal: Align, vertical?: Baseline): void {
  getActiveContext().textAlign(horizontal, vertical);
}

/**
 * Draw one line of text, anchored by the current `textAlign`.
 *
 * Content first, then the position — the opposite order to `image`, and the
 * same order as p5.
 */
export function text(content: string, x: number, y: number): void {
  getActiveContext().text(content, x, y);
}

/**
 * Draw `body` at `depth`. Lower depths paint first, and depth overrides call
 * order — within a depth, calls still paint in order. Style and transform are
 * scoped to the block.
 */
export function layer(depth: number, body: () => void): void {
  getActiveContext().layer(depth, body);
}

/** Measure one line at the current font and size. */
export function measureText(content: string): TextMetrics {
  return getActiveContext().measureText(content);
}

/** Advance width of one line at the current font and size. */
export function textWidth(content: string): number {
  return getActiveContext().textWidth(content);
}

/** Break text into lines that each fit `maxWidth`, keeping existing newlines. */
export function wrapText(content: string, maxWidth: number): readonly string[] {
  return getActiveContext().wrapText(content, maxWidth);
}

/**
 * Circle centred on `x, y`.
 *
 * A diameter, not a radius: `rect` takes a width and `square` a side, so every
 * primitive's size argument is a full extent.
 */
export function circle(x: number, y: number, diameter: number): void {
  getActiveContext().circle(x, y, diameter);
}

/** Ellipse centred on `x, y`, sized by full width and height. */
export function ellipse(x: number, y: number, width: number, height: number): void {
  getActiveContext().ellipse(x, y, width, height);
}

/** Rectangle with its top-left corner at `x, y`. */
export function rect(x: number, y: number, width: number, height: number): void {
  getActiveContext().rect(x, y, width, height);
}

/** Square with its top-left corner at `x, y`. */
export function square(x: number, y: number, size: number): void {
  getActiveContext().square(x, y, size);
}

/**
 * Straight line between two points, in the stroke colour.
 *
 * Caps are butt: a line is a rectangle rotated onto the segment, which is what
 * Canvas2D does too.
 */
export function line(x1: number, y1: number, x2: number, y2: number): void {
  getActiveContext().line(x1, y1, x2, y2);
}

/**
 * A dot of the current stroke weight.
 *
 * Follows stroke rather than fill, because a point is a degenerate line —
 * `noStroke()` makes it invisible.
 */
export function point(x: number, y: number): void {
  getActiveContext().point(x, y);
}

/** Save style and transform together, to be restored by `pop`. */
export function push(): void {
  getActiveContext().push();
}

/**
 * Restore the style and transform saved by the matching `push`.
 *
 * Prefer `scoped()` where the block can throw: an unmatched `push` leaks its
 * style into everything drawn afterwards.
 */
export function pop(): void {
  getActiveContext().pop();
}

/** Move the origin. Composes with whatever transform is already in effect. */
export function translate(x: number, y: number): void {
  getActiveContext().translate(x, y);
}

/** Rotate about the current origin, clockwise, in radians. */
export function rotate(radians: number): void {
  getActiveContext().rotate(radians);
}

/** Scale about the current origin. One argument scales both axes. */
export function scale(x: number, y?: number): void {
  getActiveContext().scale(x, y);
}

/** Run a drawing block with temporary style overrides and a restored transform. */
export function scoped(overrides: StyleOverrides, body: () => void): void {
  getActiveContext().with(overrides, body);
}
