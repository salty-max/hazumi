/** sRGB, gamma-encoded, components in [0, 1]. */
export interface Srgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

/** Linear-light RGB, components nominally in [0, 1]. What the GPU wants. */
export interface LinearRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
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

export function toLinear(srgb: Srgb): LinearRgb {
  return {
    r: linearize(srgb.r),
    g: linearize(srgb.g),
    b: linearize(srgb.b),
    alpha: srgb.alpha,
  };
}

export function fromLinear(linear: LinearRgb): Srgb {
  return {
    r: delinearize(linear.r),
    g: delinearize(linear.g),
    b: delinearize(linear.b),
    alpha: linear.alpha,
  };
}
