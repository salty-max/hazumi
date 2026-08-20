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
    circle: (x: number, y: number, radius: number): void => {
      out.push({ op: 'circle', args: [x, y, radius] });
    },
    rect: (x: number, y: number, w: number, h: number): void => {
      out.push({ op: 'rect', args: [x, y, w, h] });
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
