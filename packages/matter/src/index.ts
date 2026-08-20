/**
 * L5 — the batteries-included entry point.
 *
 * Deliberately thin: everything here should be expressible in terms of L0–L4.
 * If something can only be written at this layer, that is a signal a lower
 * layer is missing a capability, not that this layer needs more code.
 *
 * Note the split between `export` and `export type`. Classes and functions must
 * be re-exported as values — `export type { CommandBuffer }` typechecks fine and
 * then vanishes at runtime.
 */

// Values.
export { CommandBuffer, decode, Op, OP_SIZE, UnknownOpcodeError } from '@matter/graphics';

// Types.
export type { CommandVisitor } from '@matter/graphics';
export type { PluginLifecycle, Clock } from '@matter/core';
export type { Vec2, Vec3, Mat4, Rng } from '@matter/math';
export type { Oklch } from '@matter/color';

// TODO(P4): sketch(), the context object, and the ~20 drawing functions that
// make up the first vertical slice.
