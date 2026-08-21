import type { Vec2 } from './vec2';

/** Axis-aligned bounds stored as normalized minimum and maximum edges. */
export interface Aabb {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Circle in 2D space. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Intersection between a ray and a shape. Mutable so callers can reuse it. */
export interface RayHit {
  x: number;
  y: number;
  normalX: number;
  normalY: number;
  distance: number;
}

/** Earliest collision along a movement. Mutable so callers can reuse it. */
export interface SweepHit {
  /** Fraction of the supplied movement completed before impact, from 0 to 1. */
  time: number;
  normalX: number;
  normalY: number;
}

/** Build normalized bounds from a top-left position and size. */
export function aabb(x: number, y: number, width: number, height: number): Aabb {
  const x2 = x + width;
  const y2 = y + height;
  return {
    minX: Math.min(x, x2),
    minY: Math.min(y, y2),
    maxX: Math.max(x, x2),
    maxY: Math.max(y, y2),
  };
}

export function circle(x: number, y: number, radius: number): Circle {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('Circle radius must be a finite non-negative number');
  }
  return { x, y, radius };
}

export function createRayHit(): RayHit {
  return { x: 0, y: 0, normalX: 0, normalY: 0, distance: 0 };
}

export function createSweepHit(): SweepHit {
  return { time: 0, normalX: 0, normalY: 0 };
}

/** Edges count as contained. */
export function containsPointAabb(box: Aabb, point: Vec2): boolean {
  return (
    point.x >= box.minX &&
    point.x <= box.maxX &&
    point.y >= box.minY &&
    point.y <= box.maxY
  );
}

/** The circumference counts as contained. */
export function containsPointCircle(shape: Circle, point: Vec2): boolean {
  const dx = point.x - shape.x;
  const dy = point.y - shape.y;
  return dx * dx + dy * dy <= shape.radius * shape.radius;
}

/** Touching edges count as overlap. */
export function overlapsAabb(a: Aabb, b: Aabb): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Tangent circles count as overlap. */
export function overlapsCircle(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radius = a.radius + b.radius;
  return dx * dx + dy * dy <= radius * radius;
}

/** A circle tangent to an edge or corner counts as overlap. */
export function overlapsCircleAabb(shape: Circle, box: Aabb): boolean {
  const closestX = Math.max(box.minX, Math.min(shape.x, box.maxX));
  const closestY = Math.max(box.minY, Math.min(shape.y, box.maxY));
  const dx = shape.x - closestX;
  const dy = shape.y - closestY;
  return dx * dx + dy * dy <= shape.radius * shape.radius;
}

function writeRayHit(
  out: RayHit | undefined,
  x: number,
  y: number,
  normalX: number,
  normalY: number,
  distance: number,
): RayHit {
  const hit = out ?? createRayHit();
  hit.x = x;
  hit.y = y;
  hit.normalX = normalX;
  hit.normalY = normalY;
  hit.distance = distance;
  return hit;
}

function writeSweepHit(
  out: SweepHit | undefined,
  time: number,
  normalX: number,
  normalY: number,
): SweepHit {
  const hit = out ?? createSweepHit();
  hit.time = time;
  hit.normalX = normalX;
  hit.normalY = normalY;
  return hit;
}

/**
 * Cast a ray against an AABB.
 *
 * `direction` need not be normalized. A ray starting inside reports distance
 * zero with a zero normal because it did not cross an entry face.
 */
export function raycastAabb(
  origin: Vec2,
  direction: Vec2,
  box: Aabb,
  maxDistance: number = Infinity,
  out?: RayHit,
): RayHit | null {
  if (!(maxDistance >= 0)) return null;
  if (containsPointAabb(box, origin)) {
    return writeRayHit(out, origin.x, origin.y, 0, 0, 0);
  }

  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) return null;
  const dx = direction.x / length;
  const dy = direction.y / length;

  let nearX = -Infinity;
  let farX = Infinity;
  let xNormal = 0;
  if (dx === 0) {
    if (origin.x < box.minX || origin.x > box.maxX) return null;
  } else {
    const inverse = 1 / dx;
    const first = (box.minX - origin.x) * inverse;
    const second = (box.maxX - origin.x) * inverse;
    nearX = Math.min(first, second);
    farX = Math.max(first, second);
    xNormal = dx > 0 ? -1 : 1;
  }

  let nearY = -Infinity;
  let farY = Infinity;
  let yNormal = 0;
  if (dy === 0) {
    if (origin.y < box.minY || origin.y > box.maxY) return null;
  } else {
    const inverse = 1 / dy;
    const first = (box.minY - origin.y) * inverse;
    const second = (box.maxY - origin.y) * inverse;
    nearY = Math.min(first, second);
    farY = Math.max(first, second);
    yNormal = dy > 0 ? -1 : 1;
  }

  const near = Math.max(nearX, nearY);
  const far = Math.min(farX, farY);
  if (near > far || far < 0 || near < 0 || near > maxDistance) return null;

  let normalX = nearX >= nearY ? xNormal : 0;
  let normalY = nearY >= nearX ? yNormal : 0;
  if (normalX !== 0 && normalY !== 0) {
    normalX *= Math.SQRT1_2;
    normalY *= Math.SQRT1_2;
  }
  return writeRayHit(out, origin.x + dx * near, origin.y + dy * near, normalX, normalY, near);
}

/** Cast a ray against a circle. `direction` need not be normalized. */
export function raycastCircle(
  origin: Vec2,
  direction: Vec2,
  shape: Circle,
  maxDistance: number = Infinity,
  out?: RayHit,
): RayHit | null {
  if (!(maxDistance >= 0)) return null;
  const mx = origin.x - shape.x;
  const my = origin.y - shape.y;
  const radiusSq = shape.radius * shape.radius;
  const fromCenterSq = mx * mx + my * my;
  if (fromCenterSq <= radiusSq) {
    const inverse = fromCenterSq === 0 ? 0 : 1 / Math.sqrt(fromCenterSq);
    return writeRayHit(out, origin.x, origin.y, mx * inverse, my * inverse, 0);
  }

  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) return null;
  const dx = direction.x / length;
  const dy = direction.y / length;
  const projection = mx * dx + my * dy;
  if (projection > 0) return null;
  const discriminant = projection * projection - (fromCenterSq - radiusSq);
  if (discriminant < 0) return null;
  const distance = -projection - Math.sqrt(discriminant);
  if (distance < 0 || distance > maxDistance) return null;

  const x = origin.x + dx * distance;
  const y = origin.y + dy * distance;
  const inverseRadius = shape.radius === 0 ? 0 : 1 / shape.radius;
  return writeRayHit(
    out,
    x,
    y,
    (x - shape.x) * inverseRadius,
    (y - shape.y) * inverseRadius,
    distance,
  );
}

function writeInitialAabbHit(
  moving: Aabb,
  target: Aabb,
  delta: Vec2,
  out: SweepHit | undefined,
): SweepHit {
  const pushLeft = moving.maxX - target.minX;
  const pushRight = target.maxX - moving.minX;
  const pushUp = moving.maxY - target.minY;
  const pushDown = target.maxY - moving.minY;
  const horizontal = Math.min(pushLeft, pushRight);
  const vertical = Math.min(pushUp, pushDown);
  if (horizontal < vertical || (horizontal === vertical && Math.abs(delta.x) >= Math.abs(delta.y))) {
    if (pushLeft === pushRight) return writeSweepHit(out, 0, delta.x > 0 ? -1 : 1, 0);
    return writeSweepHit(out, 0, pushLeft < pushRight ? -1 : 1, 0);
  }
  if (pushUp === pushDown) return writeSweepHit(out, 0, 0, delta.y > 0 ? -1 : 1);
  return writeSweepHit(out, 0, 0, pushUp < pushDown ? -1 : 1);
}

/** Sweep a moving AABB against a static AABB. */
export function sweepAabb(
  moving: Aabb,
  delta: Vec2,
  target: Aabb,
  out?: SweepHit,
): SweepHit | null {
  const strictlyOverlapping =
    moving.minX < target.maxX &&
    moving.maxX > target.minX &&
    moving.minY < target.maxY &&
    moving.maxY > target.minY;
  if (strictlyOverlapping) {
    return writeInitialAabbHit(moving, target, delta, out);
  }

  const centerX = (moving.minX + moving.maxX) * 0.5;
  const centerY = (moving.minY + moving.maxY) * 0.5;
  const halfWidth = (moving.maxX - moving.minX) * 0.5;
  const halfHeight = (moving.maxY - moving.minY) * 0.5;
  const expandedMinX = target.minX - halfWidth;
  const expandedMaxX = target.maxX + halfWidth;
  const expandedMinY = target.minY - halfHeight;
  const expandedMaxY = target.maxY + halfHeight;

  let nearX = -Infinity;
  let farX = Infinity;
  let xNormal = 0;
  if (delta.x === 0) {
    if (centerX < expandedMinX || centerX > expandedMaxX) return null;
  } else {
    const inverse = 1 / delta.x;
    const first = (expandedMinX - centerX) * inverse;
    const second = (expandedMaxX - centerX) * inverse;
    nearX = Math.min(first, second);
    farX = Math.max(first, second);
    xNormal = delta.x > 0 ? -1 : 1;
  }

  let nearY = -Infinity;
  let farY = Infinity;
  let yNormal = 0;
  if (delta.y === 0) {
    if (centerY < expandedMinY || centerY > expandedMaxY) return null;
  } else {
    const inverse = 1 / delta.y;
    const first = (expandedMinY - centerY) * inverse;
    const second = (expandedMaxY - centerY) * inverse;
    nearY = Math.min(first, second);
    farY = Math.max(first, second);
    yNormal = delta.y > 0 ? -1 : 1;
  }

  const near = Math.max(nearX, nearY);
  const far = Math.min(farX, farY);
  if (near > far || far < 0 || near < 0 || near > 1) return null;

  let normalX = nearX >= nearY ? xNormal : 0;
  let normalY = nearY >= nearX ? yNormal : 0;
  if (normalX !== 0 && normalY !== 0) {
    normalX *= Math.SQRT1_2;
    normalY *= Math.SQRT1_2;
  }
  return writeSweepHit(out, near, normalX, normalY);
}

/** Sweep a moving circle against a static circle. */
export function sweepCircle(
  moving: Circle,
  delta: Vec2,
  target: Circle,
  out?: SweepHit,
): SweepHit | null {
  const mx = moving.x - target.x;
  const my = moving.y - target.y;
  const radius = moving.radius + target.radius;
  const centerDistanceSq = mx * mx + my * my;
  const radiusSq = radius * radius;
  if (centerDistanceSq < radiusSq) {
    if (centerDistanceSq === 0) {
      const length = Math.hypot(delta.x, delta.y);
      return writeSweepHit(
        out,
        0,
        length === 0 ? 1 : -delta.x / length,
        length === 0 ? 0 : -delta.y / length,
      );
    }
    const inverse = 1 / Math.sqrt(centerDistanceSq);
    return writeSweepHit(out, 0, mx * inverse, my * inverse);
  }

  const a = delta.x * delta.x + delta.y * delta.y;
  if (a === 0) return null;
  const b = mx * delta.x + my * delta.y;
  if (b >= 0 && centerDistanceSq >= radiusSq) return null;
  const discriminant = b * b - a * (centerDistanceSq - radiusSq);
  if (discriminant < 0) return null;
  const time = (-b - Math.sqrt(discriminant)) / a;
  if (time < 0 || time > 1) return null;

  const hitX = moving.x + delta.x * time;
  const hitY = moving.y + delta.y * time;
  const normalX = hitX - target.x;
  const normalY = hitY - target.y;
  const normalLength = Math.hypot(normalX, normalY);
  return writeSweepHit(
    out,
    time,
    normalLength === 0 ? 0 : normalX / normalLength,
    normalLength === 0 ? 0 : normalY / normalLength,
  );
}
