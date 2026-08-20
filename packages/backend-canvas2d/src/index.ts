/**
 * L4 — Canvas2D. Deliberately NOT the primary path.
 *
 * Two jobs: golden-image oracle for verifying WebGL2 correctness, and the text
 * fallback for complex scripts and emoji that MSDF cannot handle.
 */

export interface Canvas2dOptions {
  readonly alpha?: boolean;
}

// TODO(P3): direct replay of the command buffer.
