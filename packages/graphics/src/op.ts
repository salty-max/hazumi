/**
 * Opcodes are written into the command buffer as raw numbers, so they are
 * append-only: never renumber an existing value, or previously recorded streams
 * become garbage. `packages/graphics/test/op.test.ts` enforces this.
 *
 * A frozen object rather than an `enum` because the base tsconfig sets
 * `erasableSyntaxOnly`, so the source stays valid type-stripped JavaScript.
 */
export const Op = {
  Circle: 0,
  Rect: 1,
  Path: 2,
  Stroke: 3,
  PushStyle: 4,
  PopStyle: 5,
  SetFill: 6,
} as const;

export type Op = (typeof Op)[keyof typeof Op];

/** Total word count of each command, including the opcode word itself. */
export const OP_SIZE: Readonly<Record<Op, number>> = {
  [Op.Circle]: 4, // op, x, y, r
  [Op.Rect]: 5, // op, x, y, w, h
  [Op.Path]: 1, // TODO(P3)
  [Op.Stroke]: 1, // TODO(P3)
  [Op.PushStyle]: 1,
  [Op.PopStyle]: 1,
  [Op.SetFill]: 5, // op, r, g, b, a
};
