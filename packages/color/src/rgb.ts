import { fromSrgb, type Oklch } from "./oklch";

/**
 * sRGB, channels 0–255, alpha 0–1.
 *
 * Returns OKLCH so it can mix with `oklch()` and go straight into `fill`.
 * String CSS is still accepted by the drawing API; this is the typed path.
 */
export function rgb(r: number, g: number, b: number, alpha = 1): Oklch {
  return fromSrgb({
    r: channel8(r, "r"),
    g: channel8(g, "g"),
    b: channel8(b, "b"),
    alpha: unitAlpha(alpha),
  });
}

function channel8(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
  return Math.min(Math.max(value, 0), 255) / 255;
}

function unitAlpha(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("alpha must be a finite number");
  return Math.min(Math.max(value, 0), 1);
}
