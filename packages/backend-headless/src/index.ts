import { type CommandBuffer, type CommandVisitor, decode } from "@hazumi/graphics";

/**
 * L4 — records the command stream instead of rendering it, so tests assert on
 * what was drawn rather than pixel-diffing a browser screenshot.
 *
 * This backend allocates freely: it is a test instrument, never a hot path.
 */

export interface RecordedCommand {
  readonly op: string;
  readonly args: readonly number[];
  /** Present for text commands, whose payload is not numeric. */
  readonly text?: string;
}

/** A circle as `record()` reports it, in the units the command stream carries. */
export interface RecordedCircle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Fill in effect when the circle was emitted, as linear RGBA. */
  readonly fill: readonly [number, number, number, number];
}

/** Flat log of every command, in stream order. */
export function record(buffer: CommandBuffer): RecordedCommand[] {
  const out: RecordedCommand[] = [];

  const visitor: CommandVisitor = {
    setFill: (r: number, g: number, b: number, a: number): void => {
      out.push({ op: "setFill", args: [r, g, b, a] });
    },
    setMaterial: (
      kind: number,
      r: number,
      g: number,
      b: number,
      a: number,
      p0: number,
      p1: number,
      p2: number,
    ): void => {
      out.push({ op: "setMaterial", args: [kind, r, g, b, a, p0, p1, p2] });
    },
    setTint: (r: number, g: number, b: number, a: number): void => {
      out.push({ op: "setTint", args: [r, g, b, a] });
    },
    setStroke: (r: number, g: number, b: number, a: number): void => {
      out.push({ op: "setStroke", args: [r, g, b, a] });
    },
    setStrokeWidth: (width: number): void => {
      out.push({ op: "setStrokeWidth", args: [width] });
    },
    setBlend: (mode: number): void => {
      out.push({ op: "setBlend", args: [mode] });
    },
    push: (): void => void out.push({ op: "push", args: [] }),
    pop: (): void => void out.push({ op: "pop", args: [] }),
    translate: (x: number, y: number): void => {
      out.push({ op: "translate", args: [x, y] });
    },
    rotate: (radians: number): void => {
      out.push({ op: "rotate", args: [radians] });
    },
    scale: (x: number, y: number): void => {
      out.push({ op: "scale", args: [x, y] });
    },
    resetTransform: (): void => {
      out.push({ op: "resetTransform", args: [] });
    },
    background: (r: number, g: number, b: number, a: number): void => {
      out.push({ op: "background", args: [r, g, b, a] });
    },
    circle: (x: number, y: number, radius: number): void => {
      out.push({ op: "circle", args: [x, y, radius] });
    },
    ellipse: (x: number, y: number, rx: number, ry: number): void => {
      out.push({ op: "ellipse", args: [x, y, rx, ry] });
    },
    rect: (x: number, y: number, w: number, h: number): void => {
      out.push({ op: "rect", args: [x, y, w, h] });
    },
    line: (x1: number, y1: number, x2: number, y2: number): void => {
      out.push({ op: "line", args: [x1, y1, x2, y2] });
    },
    setTextSize: (size: number): void => {
      out.push({ op: "setTextSize", args: [size] });
    },
    setTextAlign: (h: number, v: number): void => {
      out.push({ op: "setTextAlign", args: [h, v] });
    },
    setFont: (family: string): void => {
      out.push({ op: "setFont", args: [], text: family });
    },
    text: (x: number, y: number, content: string): void => {
      out.push({ op: "text", args: [x, y], text: content });
    },
    beginPath: (): void => void out.push({ op: "beginPath", args: [] }),
    moveTo: (x: number, y: number): void => void out.push({ op: "moveTo", args: [x, y] }),
    lineTo: (x: number, y: number): void => void out.push({ op: "lineTo", args: [x, y] }),
    quadraticTo: (cx: number, cy: number, x: number, y: number): void => {
      out.push({ op: "quadraticTo", args: [cx, cy, x, y] });
    },
    cubicTo: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void => {
      out.push({ op: "cubicTo", args: [c1x, c1y, c2x, c2y, x, y] });
    },
    closePath: (): void => void out.push({ op: "closePath", args: [] }),
    fillPath: (): void => void out.push({ op: "fillPath", args: [] }),
    strokePath: (): void => void out.push({ op: "strokePath", args: [] }),
    image: (_source, x: number, y: number, w: number, h: number): void => {
      out.push({ op: "image", args: [x, y, w, h] });
    },
    imageRegion: (_source, dx, dy, dw, dh, sx, sy, sw, sh): void => {
      out.push({ op: "imageRegion", args: [dx, dy, dw, dh, sx, sy, sw, sh] });
    },
  };

  decode(buffer, visitor);
  return out;
}

/**
 * Circles with style resolved — the same flattening the GPU backend performs
 * when it builds instance attributes, which makes this the reference for
 * verifying that resolution without a GL context.
 */
export function recordCircles(buffer: CommandBuffer): RecordedCircle[] {
  const out: RecordedCircle[] = [];
  let fr = 0;
  let fg = 0;
  let fb = 0;
  let fa = 1;

  const visitor: CommandVisitor = {
    setFill: (r: number, g: number, b: number, a: number): void => {
      fr = r;
      fg = g;
      fb = b;
      fa = a;
    },
    circle: (x: number, y: number, radius: number): void => {
      out.push({ x, y, radius, fill: [fr, fg, fb, fa] });
    },
  };

  decode(buffer, visitor);
  return out;
}
