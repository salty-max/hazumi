/**
 * L2 — color as a real type, interpolated in OKLCH rather than sRGB so
 * gradients stay perceptually even instead of muddying through grey.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  readonly l: number;
  /** Chroma, 0–~0.4. */
  readonly c: number;
  /** Hue in degrees, 0–360. */
  readonly h: number;
  /** Alpha, 0–1. */
  readonly alpha: number;
}

// TODO(P2): CSS Color 4 parsing, OKLCH<->sRGB conversion, gamut mapping, mix().
