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
  /** Fill the path built since BeginPath. */
  FillPath: 2,
  /** Stroke the path built since BeginPath. */
  StrokePath: 3,
  /** Saves style and transform together. */
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
  Text: 16,
  SetTextSize: 17,
  SetTextAlign: 18,
  SetFont: 19,
  Image: 20,
  BeginPath: 21,
  MoveTo: 22,
  LineTo: 23,
  QuadraticTo: 24,
  CubicTo: 25,
  ClosePath: 26,
  /**
   * A sub-rectangle of an image, in source pixels.
   *
   * Separate from Image rather than widening it: changing an existing
   * opcode's width would desync every previously recorded stream, and the
   * whole-image case stays four words cheaper.
   */
  ImageRegion: 27,
  /** Replace the current transform with identity without touching style. */
  ResetTransform: 28,
  /**
   * Multiplier for images, independent of fill so `noFill()` cannot hide a
   * sprite. Default is opaque white — a no-op.
   */
  SetTint: 29,
  /**
   * One effect from a fixed vocabulary, applied to textured draws.
   *
   * A single opcode rather than one per effect: the kind is an operand, so
   * adding a fifth material later widens a switch instead of appending an
   * opcode that older streams do not carry.
   */
  SetMaterial: 30,
} as const;

export type Op = (typeof Op)[keyof typeof Op];

/** Total word count of each command, including the opcode word itself. */
export const OP_SIZE: Readonly<Record<Op, number>> = {
  [Op.Circle]: 4, // op, x, y, r
  [Op.Rect]: 5, // op, x, y, w, h
  [Op.FillPath]: 1,
  [Op.StrokePath]: 1,
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
  [Op.Text]: 4, // op, x, y, stringId
  [Op.SetTextSize]: 2, // op, size
  [Op.SetTextAlign]: 3, // op, horizontal, vertical
  [Op.SetFont]: 2, // op, stringId
  [Op.Image]: 6, // op, imageId, x, y, w, h
  // A path is a run of fixed-width commands rather than one variable-length
  // record. Every command keeps a constant size, so the decoder needs no
  // special case, and the sequence maps directly onto both Canvas2D's path API
  // and an SVG `d` attribute.
  [Op.BeginPath]: 1,
  [Op.MoveTo]: 3, // op, x, y
  [Op.LineTo]: 3, // op, x, y
  [Op.QuadraticTo]: 5, // op, cx, cy, x, y
  [Op.CubicTo]: 7, // op, c1x, c1y, c2x, c2y, x, y
  [Op.ClosePath]: 1,
  [Op.ImageRegion]: 10, // op, imageId, dx, dy, dw, dh, sx, sy, sw, sh
  [Op.ResetTransform]: 1,
  [Op.SetTint]: 5, // op, r, g, b, a
  [Op.SetMaterial]: 9, // op, kind, r, g, b, a, p0, p1, p2
};

/**
 * Per-sprite effects, from a fixed vocabulary.
 *
 * Fixed, and not "a fragment shader per sprite", because the effect has to
 * travel in the instance data rather than in a program: two sprites wearing
 * different materials still merge into one draw call, and a hundred enemies
 * flashing on different frames stay a hundred instances of one batch. A
 * per-sprite program would make each of them its own draw.
 *
 * The cost of that is this list. Each entry is something the existing state
 * cannot already express — a tint multiplies and so cannot lighten toward a
 * colour, a blend mode applies to a whole draw and not to a sprite's edge —
 * and each is paid for by two words on every textured instance.
 */
export const MaterialKind = {
  None: 0,
  /** Lerp toward a colour, keeping the sprite's own alpha. The hit flash. */
  Flash: 1,
  /** A border drawn in the transparent texels around the art. Images only. */
  Outline: 2,
  /** Eat the sprite away along a noise field, with a burning edge. */
  Dissolve: 3,
} as const;

export type MaterialKind = (typeof MaterialKind)[keyof typeof MaterialKind];

/** Horizontal text anchor. */
export const Align = {
  Left: 0,
  Center: 1,
  Right: 2,
} as const;

export type Align = (typeof Align)[keyof typeof Align];

/** Vertical text anchor. */
export const Baseline = {
  Alphabetic: 0,
  Top: 1,
  Middle: 2,
  Bottom: 3,
} as const;

export type Baseline = (typeof Baseline)[keyof typeof Baseline];

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
