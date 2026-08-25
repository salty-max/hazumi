import { angleDelta, clamp, lerp, wrap } from "@hazumi/math";
import type { Oklch } from "./oklch";

/**
 * Interpolate two colours in OKLCH.
 *
 * Hue takes the shorter way around the wheel, so red to magenta does not
 * detour through green. This is the whole reason the library stores colour in
 * OKLCH rather than sRGB: the midpoint stays as saturated as its endpoints
 * instead of desaturating through grey.
 */
export function mix(a: Oklch, b: Oklch, t: number): Oklch {
  // A greyscale endpoint has no meaningful hue; adopt the other one's so the
  // blend does not sweep an arbitrary arc.
  const aHasHue = a.c > 1e-7;
  const bHasHue = b.c > 1e-7;
  const fromHue = aHasHue ? a.h : bHasHue ? b.h : 0;
  const toHue = bHasHue ? b.h : fromHue;

  return {
    l: lerp(a.l, b.l, t),
    c: lerp(a.c, b.c, t),
    h: wrap(fromHue + angleDelta(fromHue, toHue) * t, 360),
    alpha: lerp(a.alpha, b.alpha, t),
  };
}

/** Evenly spaced samples along a mix, inclusive of both endpoints. */
export function gradient(a: Oklch, b: Oklch, steps: number): Oklch[] {
  if (steps < 2) throw new Error("gradient() needs at least 2 steps");
  const out: Oklch[] = [];
  for (let i = 0; i < steps; i++) out.push(mix(a, b, i / (steps - 1)));
  return out;
}

/** Multiply lightness, keeping hue and chroma. */
export function lighten(color: Oklch, amount: number): Oklch {
  return { ...color, l: clamp(color.l + amount, 0, 1) };
}

/** Subtract from lightness, keeping hue and chroma. `lighten` with a sign. */
export function darken(color: Oklch, amount: number): Oklch {
  return lighten(color, -amount);
}

/** The same colour at a different opacity. */
export function withAlpha(color: Oklch, alpha: number): Oklch {
  return { ...color, alpha: clamp(alpha, 0, 1) };
}

/** Rotate hue around the wheel, in degrees. */
export function rotateHue(color: Oklch, degrees: number): Oklch {
  return { ...color, h: wrap(color.h + degrees, 360) };
}
