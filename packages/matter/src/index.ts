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
 *
 * Re-exports are explicit rather than `export *` so a name collision between
 * packages is a conflict here rather than a silent shadow.
 */

// --- L0 core ---
export { SketchClock, createSketch, definePlugin, DuplicatePluginError } from '@matter/core';
export type {
  Clock,
  ClockOptions,
  Plugin,
  PluginHost,
  PluginLifecycle,
  SketchBuilder,
  SketchCore,
} from '@matter/core';

// --- L1 math ---
export {
  vec2,
  vec3,
  mat4,
  easing,
  seeded,
  createNoise,
  lerp,
  clamp,
  norm,
  remap,
  degrees,
  radians,
  wrap,
  angleDelta,
  smoothstep,
} from '@matter/math';
export type { Vec2, Vec3, Mat4, Easing, Rng, Noise } from '@matter/math';

// --- L2 color ---
export {
  oklch,
  parse as parseColor,
  tryParse as tryParseColor,
  ColorParseError,
  toSrgb,
  fromSrgb,
  toLinearRgb,
  inGamut,
  clampToGamut,
  toCss,
  toHex,
  toRgbCss,
  mix,
  gradient,
  lighten,
  darken,
  withAlpha,
  rotateHue,
} from '@matter/color';
export type { Oklch, Oklab, Srgb, LinearRgb } from '@matter/color';

// --- L3 graphics ---
export { CommandBuffer, decode, Op, OP_SIZE, UnknownOpcodeError } from '@matter/graphics';
export type { CommandVisitor } from '@matter/graphics';

// TODO(P4): sketch(), the context object, and the ~20 drawing functions that
// make up the first vertical slice.
