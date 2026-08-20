/**
 * L3 — the command buffer and everything that writes into it.
 *
 * INVARIANT: the buffer stores high-level primitives (circle, bezier path,
 * stroke width) and NEVER triangles. Tessellation belongs to the backend.
 * Tessellating here is lossy and irreversible: it breaks SVG export, bakes in a
 * resolution, and forfeits the analytic SDF shader path. See AGENTS.md.
 */

/**
 * Opcodes are stable numeric tags; append, never renumber.
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
} as const;

export type Op = (typeof Op)[keyof typeof Op];

/**
 * Struct-of-arrays encoding: geometry in a Float32Array, opcodes and style
 * handles in a parallel Uint32Array. Kept allocation-free in the hot path.
 */
export interface CommandBuffer {
  readonly geometry: Float32Array;
  readonly ops: Uint32Array;
  readonly length: number;
}

// TODO(P1): buffer encoding and the allocation-free write path.
