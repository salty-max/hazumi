/**
 * 2D vectors as plain immutable objects.
 *
 * These allocate, which is fine: they are for user-facing scene code, not the
 * per-frame encode path. The hot path takes primitives — see CommandBuffer.
 */

export interface Vec2 {
  /** Horizontal component. Positive is right. */
  readonly x: number;
  /** Vertical component. Positive is down, matching screen space. */
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export const ZERO2: Vec2 = { x: 0, y: 0 };

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/**
 * `a + b * s`, in one step.
 *
 * Integration, and the single most common thing anyone writes with vectors:
 * a position advanced by a velocity over a step, a steering force weighted
 * before it is applied. Worth its own name because the two-call version
 * allocates a vector nobody keeps.
 */
export function addScaled(a: Vec2, b: Vec2, s: number): Vec2 {
  return { x: a.x + b.x * s, y: a.y + b.y * s };
}

export function mul(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x * b.x, y: a.y * b.y };
}

export function negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Z component of the 3D cross product; sign gives winding. */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Unit vector, or the zero vector if the input has no length. */
export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? ZERO2 : { x: v.x / len, y: v.y / len };
}

export function withLength(v: Vec2, len: number): Vec2 {
  return scale(normalize(v), len);
}

export function limit(v: Vec2, max: number): Vec2 {
  return lengthSq(v) > max * max ? withLength(v, max) : v;
}

/**
 * Step from `a` toward `b`, by at most `maxDistance`.
 *
 * Lands exactly on `b` rather than approaching it forever, which is the
 * difference from `lerp`: a homing missile and a cursor snapping to a target
 * both need to arrive.
 */
export function moveTowards(a: Vec2, b: Vec2, maxDistance: number): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const gap = Math.hypot(dx, dy);
  if (gap === 0 || gap <= maxDistance) return b;
  return { x: a.x + (dx / gap) * maxDistance, y: a.y + (dy / gap) * maxDistance };
}

/**
 * Bounce off a surface with the given normal.
 *
 * The normal is assumed to be unit length — `normalize` it first if it came
 * from a subtraction. This is the mirror reflection, so it keeps all of the
 * incoming speed; scale the result to lose energy on the bounce.
 */
export function reflect(v: Vec2, normal: Vec2): Vec2 {
  const d = 2 * (v.x * normal.x + v.y * normal.y);
  return { x: v.x - d * normal.x, y: v.y - d * normal.y };
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Counter-clockwise rotation, in radians. */
export function rotate(v: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Angle in radians, measured from +x. */
export function heading(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

export function fromAngle(radians: number, len = 1): Vec2 {
  return { x: Math.cos(radians) * len, y: Math.sin(radians) * len };
}

/** Perpendicular, rotated 90 degrees counter-clockwise. */
export function perpendicular(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

export function equals(a: Vec2, b: Vec2, epsilon = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}
