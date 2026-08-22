import { Align, Baseline, Blend, type ImageSource } from "@hazumi/graphics";
import { getActiveContext, NoActiveSceneError } from "./active-context";
import type { ColorLike } from "./color-cache";
import type { SpriteFrame } from "./spritesheet";
import type { StyleOverrides } from "./context";

export { Align, Baseline, Blend, NoActiveSceneError };
export { oklch, rgb } from "@hazumi/color";
export type { ColorLike, StyleOverrides };

export function background(color: ColorLike): void {
  getActiveContext().background(color);
}

export function fill(color: ColorLike): void {
  getActiveContext().fill(color);
}

/** Set fill from display-referred 0–1 channels. No parse, no allocation. */
export function fillRgba(r: number, g: number, b: number, a: number): void {
  getActiveContext().fillRgba(r, g, b, a);
}

export function noFill(): void {
  getActiveContext().noFill();
}

/** Multiplier for images. Independent of fill so `noFill()` cannot hide a sprite. */
export function tint(color: ColorLike): void {
  getActiveContext().tint(color);
}

/** Opaque white — a no-op multiply. */
export function noTint(): void {
  getActiveContext().noTint();
}

export function stroke(color: ColorLike): void {
  getActiveContext().stroke(color);
}

export function noStroke(): void {
  getActiveContext().noStroke();
}

export function strokeWeight(weight: number): void {
  getActiveContext().strokeWeight(weight);
}

export function blendMode(mode: Blend): void {
  getActiveContext().blendMode(mode);
}

export function beginShape(): void {
  getActiveContext().beginShape();
}

export function vertex(x: number, y: number): void {
  getActiveContext().vertex(x, y);
}

export function quadraticVertex(cx: number, cy: number, x: number, y: number): void {
  getActiveContext().quadraticVertex(cx, cy, x, y);
}

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

export function textFont(family: string): void {
  getActiveContext().textFont(family);
}

export function textSize(size: number): void {
  getActiveContext().textSize(size);
}

export function textAlign(horizontal: Align, vertical?: Baseline): void {
  getActiveContext().textAlign(horizontal, vertical);
}

export function text(content: string, x: number, y: number): void {
  getActiveContext().text(content, x, y);
}

export function circle(x: number, y: number, diameter: number): void {
  getActiveContext().circle(x, y, diameter);
}

export function ellipse(x: number, y: number, width: number, height: number): void {
  getActiveContext().ellipse(x, y, width, height);
}

export function rect(x: number, y: number, width: number, height: number): void {
  getActiveContext().rect(x, y, width, height);
}

export function square(x: number, y: number, size: number): void {
  getActiveContext().square(x, y, size);
}

export function line(x1: number, y1: number, x2: number, y2: number): void {
  getActiveContext().line(x1, y1, x2, y2);
}

export function point(x: number, y: number): void {
  getActiveContext().point(x, y);
}

export function push(): void {
  getActiveContext().push();
}

export function pop(): void {
  getActiveContext().pop();
}

export function translate(x: number, y: number): void {
  getActiveContext().translate(x, y);
}

export function rotate(radians: number): void {
  getActiveContext().rotate(radians);
}

export function scale(x: number, y?: number): void {
  getActiveContext().scale(x, y);
}

/** Run a drawing block with temporary style overrides and a restored transform. */
export function scoped(overrides: StyleOverrides, body: () => void): void {
  getActiveContext().with(overrides, body);
}
