/**
 * L2 — colour as a real type.
 *
 * Stored and interpolated in OKLCH so blends stay perceptually even instead of
 * dipping through grey, and gamut-mapped by reducing chroma rather than
 * clipping RGB, which would shift the hue the author asked for.
 */

export {
  oklch,
  toSrgb,
  fromSrgb,
  toLinearRgb,
  fromLinearRgb,
  inGamut,
  clampToGamut,
  oklabToOklch,
  oklchToOklab,
  linearRgbToOklab,
  oklabToLinearRgb,
} from "./oklch";
export type { Oklch, Oklab } from "./oklch";

export { rgb } from "./rgb";
export { linearize, delinearize, toLinear, fromLinear } from "./srgb";
export type { Srgb, LinearRgb } from "./srgb";

export { parse, tryParse, ColorParseError } from "./parse";
export { namedColorHex } from "./named";
export { toCss, toHex, toRgbCss } from "./format";
export { mix, gradient, lighten, darken, withAlpha, rotateHue } from "./mix";
