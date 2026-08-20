import {
  type CommandBuffer,
  type CommandVisitor,
  decode,
} from '@matter/graphics';

/**
 * L4 — records the command stream instead of rendering it, so tests assert on
 * what was drawn rather than pixel-diffing a browser screenshot.
 *
 * This backend allocates freely: it is a test instrument, never a hot path.
 */

export interface RecordedCommand {
  readonly op: string;
  readonly args: readonly number[];
}

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
      out.push({ op: 'setFill', args: [r, g, b, a] });
    },
    setStroke: (r: number, g: number, b: number, a: number): void => {
      out.push({ op: 'setStroke', args: [r, g, b, a] });
    },
    setStrokeWidth: (width: number): void => {
      out.push({ op: 'setStrokeWidth', args: [width] });
    },
    setBlend: (mode: number): void => {
      out.push({ op: 'setBlend', args: [mode] });
    },
    push: (): void => void out.push({ op: 'push', args: [] }),
    pop: (): void => void out.push({ op: 'pop', args: [] }),
    translate: (x: number, y: number): void => {
      out.push({ op: 'translate', args: [x, y] });
    },
    rotate: (radians: number): void => {
      out.push({ op: 'rotate', args: [radians] });
    },
    scale: (x: number, y: number): void => {
      out.push({ op: 'scale', args: [x, y] });
    },
    background: (r: number, g: number, b: number, a: number): void => {
      out.push({ op: 'background', args: [r, g, b, a] });
    },
    circle: (x: number, y: number, radius: number): void => {
      out.push({ op: 'circle', args: [x, y, radius] });
    },
    ellipse: (x: number, y: number, rx: number, ry: number): void => {
      out.push({ op: 'ellipse', args: [x, y, rx, ry] });
    },
    rect: (x: number, y: number, w: number, h: number): void => {
      out.push({ op: 'rect', args: [x, y, w, h] });
    },
    line: (x1: number, y1: number, x2: number, y2: number): void => {
      out.push({ op: 'line', args: [x1, y1, x2, y2] });
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
