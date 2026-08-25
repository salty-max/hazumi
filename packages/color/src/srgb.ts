/** sRGB, gamma-encoded, components in [0, 1]. */
export interface Srgb {
  /** Red, 0–1, gamma-encoded. */
  readonly r: number;
  /** Green, 0–1, gamma-encoded. */
  readonly g: number;
  /** Blue, 0–1, gamma-encoded. */
  readonly b: number;
  /** Opacity, 0–1. Never gamma-encoded, in any of these spaces. */
  readonly alpha: number;
}

/** Linear-light RGB, components nominally in [0, 1]. What the GPU wants. */
export interface LinearRgb {
  /** Red, linear light. May fall outside 0–1 when a colour is out of gamut. */
  readonly r: number;
  /** Green, linear light. */
  readonly g: number;
  /** Blue, linear light. */
  readonly b: number;
  /** Opacity, 0–1. */
  readonly alpha: number;
}

/** sRGB electro-optical transfer function. */
export function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Inverse of `linearize`. */
export function delinearize(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/**
 * sRGB to linear light, per channel. Alpha passes through untouched — it was
 * never gamma-encoded.
 */
export function toLinear(srgb: Srgb): LinearRgb {
  return {
    r: linearize(srgb.r),
    g: linearize(srgb.g),
    b: linearize(srgb.b),
    alpha: srgb.alpha,
  };
}

/** Linear light back to sRGB. The inverse of `toLinear`. */
export function fromLinear(linear: LinearRgb): Srgb {
  return {
    r: delinearize(linear.r),
    g: delinearize(linear.g),
    b: delinearize(linear.b),
    alpha: linear.alpha,
  };
}
