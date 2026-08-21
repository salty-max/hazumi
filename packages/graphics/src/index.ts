/**
 * L3 — the command buffer and everything that writes into it.
 *
 * INVARIANT: the buffer stores high-level primitives (circle, bezier path,
 * stroke width) and NEVER triangles. Tessellation belongs to the backend.
 * Tessellating here is lossy and irreversible: it breaks SVG export, bakes in a
 * resolution, and forfeits the analytic SDF shader path. See AGENTS.md.
 */

export { Op, OP_SIZE, Blend, Align, Baseline } from './op';
export { CommandBuffer } from './command-buffer';
export type { ImageSource } from './command-buffer';
export { decode, UnknownOpcodeError } from './decode';
export type { CommandVisitor } from './decode';
export {
  identityAffine,
  copyAffine,
  resetAffine,
  translateAffine,
  rotateAffine,
  scaleAffine,
  scaleFactor,
} from './affine';
export type { Affine } from './affine';
export type { Renderer, BackendFactory, PixelData } from './renderer';
