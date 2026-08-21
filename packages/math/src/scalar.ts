/** Scalar helpers. All pure, all allocation-free. */

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Fraction of the way `value` sits between `start` and `end`. */
export function norm(value: number, start: number, end: number): number {
  return end === start ? 0 : (value - start) / (end - start);
}

/** Re-range `value` from one interval to another, optionally clamping. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  clamped = false,
): number {
  const t = norm(value, inMin, inMax);
  const mapped = lerp(outMin, outMax, t);
  if (!clamped) return mapped;
  return outMin < outMax ? clamp(mapped, outMin, outMax) : clamp(mapped, outMax, outMin);
}

export function degrees(angleInRadians: number): number {
  return (angleInRadians * 180) / Math.PI;
}

export function radians(angleInDegrees: number): number {
  return (angleInDegrees * Math.PI) / 180;
}

/** Wrap into [0, max), staying positive for negative input. */
export function wrap(value: number, max: number): number {
  const r = value % max;
  return r < 0 ? r + max : r;
}

/** Shortest signed distance from angle `a` to `b`, both in degrees. */
export function angleDelta(a: number, b: number): number {
  return wrap(b - a + 180, 360) - 180;
}

/** Smooth Hermite interpolation between two edges. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp(norm(x, edge0, edge1), 0, 1);
  return t * t * (3 - 2 * t);
}
