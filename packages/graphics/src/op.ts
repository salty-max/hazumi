/**
 * Opcodes are written into the command buffer as raw numbers, so they are
 * append-only: never renumber an existing value, or previously recorded streams
 * become garbage. `packages/graphics/test/op.test.ts` enforces both the values
 * and the width each one writes.
 *
 * A frozen object rather than an `enum` because the base tsconfig sets
 * `erasableSyntaxOnly`, so the source stays valid type-stripped JavaScript.
 */
export const Op = {
  Circle: 0,
  Rect: 1,
  /** Reserved for P5 bezier paths. */
  Path: 2,
  /** Reserved for P5 polyline strokes. */
  StrokePath: 3,
  /** Saves style and transform together, like p5's push(). */
  Push: 4,
  Pop: 5,
  SetFill: 6,
  SetStroke: 7,
  SetStrokeWidth: 8,
  SetBlend: 9,
  Translate: 10,
  Rotate: 11,
  Scale: 12,
  Line: 13,
  Background: 14,
  Ellipse: 15,
} as const;

export type Op = (typeof Op)[keyof typeof Op];

/** Total word count of each command, including the opcode word itself. */
export const OP_SIZE: Readonly<Record<Op, number>> = {
  [Op.Circle]: 4, // op, x, y, r
  [Op.Rect]: 5, // op, x, y, w, h
  [Op.Path]: 1, // reserved
  [Op.StrokePath]: 1, // reserved
  [Op.Push]: 1,
  [Op.Pop]: 1,
  [Op.SetFill]: 5, // op, r, g, b, a
  [Op.SetStroke]: 5, // op, r, g, b, a
  [Op.SetStrokeWidth]: 2, // op, width
  [Op.SetBlend]: 2, // op, mode
  [Op.Translate]: 3, // op, x, y
  [Op.Rotate]: 2, // op, radians
  [Op.Scale]: 3, // op, x, y
  [Op.Line]: 5, // op, x1, y1, x2, y2
  [Op.Background]: 5, // op, r, g, b, a
  [Op.Ellipse]: 5, // op, x, y, rx, ry
};

/**
 * Blend modes. This is the pipeline key: it maps to actual GL blend state, so
 * a change here is the one thing that forces a new draw call.
 */
export const Blend = {
  /** Source-over. */
  Normal: 0,
  /** Additive, for glow and light accumulation. */
  Add: 1,
} as const;

export type Blend = (typeof Blend)[keyof typeof Blend];
