/**
 * L4 — the primary renderer. This is where the real engineering lives.
 *
 * Subsystems (see §05 of the architecture doc):
 *   resource/  handles over descriptors, so context loss is recoverable
 *   shaders/   GLSL ES 3.00 + generated typed accessors
 *   batch/     pipeline keys, instancing, draw-order rules
 *   text/      MSDF atlas with a Canvas2D fallback
 */

export interface Webgl2Options {
  /** Multisample count for the offscreen target. */
  readonly samples?: number;
  /** Reserved: allocating a depth attachment is a config flag, not a redesign. */
  readonly depth?: boolean;
}

// TODO(P1): minimal instanced-SDF path — 100k shapes, one draw call, zero
// steady-state allocation, plus forced context-loss recovery.
