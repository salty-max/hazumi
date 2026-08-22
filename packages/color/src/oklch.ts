import { clamp } from "@hazumi/math";
import { fromLinear, type LinearRgb, type Srgb, toLinear } from "./srgb";

/**
 * Colour in OKLCH.
 *
 * OKLCH rather than sRGB because interpolation in it is perceptually even —
 * a gradient between two saturated hues stays saturated instead of dipping
 * through grey, which is visible in almost every scene that blends colours.
 *
 * Conversion coefficients are Björn Ottosson's Oklab matrices.
 */
export interface Oklch {
  /** Perceptual lightness, 0–1. */
  readonly l: number;
  /** Chroma, 0 to roughly 0.4. Unbounded in principle. */
  readonly c: number;
  /** Hue in degrees, 0–360. */
  readonly h: number;
  /** Alpha, 0–1. */
  readonly alpha: number;
}

export interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
  readonly alpha: number;
}

export function oklch(l: number, c: number, h: number, alpha = 1): Oklch {
  return { l, c, h, alpha };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const c = Math.hypot(lab.a, lab.b);
  // Hue is meaningless at zero chroma; report 0 rather than an atan2 artefact.
  const h = c < 1e-7 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { l: lab.l, c, h, alpha: lab.alpha };
}

export function oklchToOklab(color: Oklch): Oklab {
  const rad = (color.h * Math.PI) / 180;
  return {
    l: color.l,
    a: Math.cos(rad) * color.c,
    b: Math.sin(rad) * color.c,
    alpha: color.alpha,
  };
}

export function linearRgbToOklab(rgb: LinearRgb): Oklab {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

  // Cube roots of the LMS response; Ottosson's reference code calls these
  // the primed variables.
  const lCbrt = Math.cbrt(l);
  const mCbrt = Math.cbrt(m);
  const sCbrt = Math.cbrt(s);

  return {
    l: 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt,
    alpha: rgb.alpha,
  };
}

export function oklabToLinearRgb(lab: Oklab): LinearRgb {
  const lCbrt = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mCbrt = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sCbrt = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    alpha: lab.alpha,
  };
}

/** Unclamped linear RGB. May fall outside [0, 1] when the colour is out of gamut. */
export function toLinearRgb(color: Oklch): LinearRgb {
  return oklabToLinearRgb(oklchToOklab(color));
}

export function fromLinearRgb(rgb: LinearRgb): Oklch {
  return oklabToOklch(linearRgbToOklab(rgb));
}

export function fromSrgb(srgb: Srgb): Oklch {
  return fromLinearRgb(toLinear(srgb));
}

/** True when the colour can be shown in sRGB without clipping. */
export function inGamut(color: Oklch, epsilon = 1e-4): boolean {
  const rgb = toLinearRgb(color);
  return (
    rgb.r >= -epsilon &&
    rgb.r <= 1 + epsilon &&
    rgb.g >= -epsilon &&
    rgb.g <= 1 + epsilon &&
    rgb.b >= -epsilon &&
    rgb.b <= 1 + epsilon
  );
}

/**
 * Reduce chroma until the colour fits in sRGB, preserving lightness and hue.
 *
 * Clipping RGB directly shifts hue — a saturated blue clips toward purple.
 * Binary-searching chroma keeps the hue the author asked for.
 */
export function clampToGamut(color: Oklch): Oklch {
  if (inGamut(color)) return color;

  // Lightness outside [0, 1] has no in-gamut chroma at all.
  const l = clamp(color.l, 0, 1);
  if (!inGamut({ ...color, l, c: 0 })) {
    return { l: clamp(l, 0, 1), c: 0, h: color.h, alpha: color.alpha };
  }

  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ l, c: mid, h: color.h, alpha: color.alpha })) lo = mid;
    else hi = mid;
  }

  return { l, c: lo, h: color.h, alpha: color.alpha };
}

/** Gamut-mapped sRGB, ready to display. */
export function toSrgb(color: Oklch): Srgb {
  const mapped = clampToGamut(color);
  const rgb = fromLinear(toLinearRgb(mapped));
  return {
    r: clamp(rgb.r, 0, 1),
    g: clamp(rgb.g, 0, 1),
    b: clamp(rgb.b, 0, 1),
    alpha: clamp(rgb.alpha, 0, 1),
  };
}
