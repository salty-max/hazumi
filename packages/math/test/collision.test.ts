import { describe, expect, test } from "bun:test";
import { collision, vec2 } from "../src/index";

describe("shape construction", () => {
  test("aabb normalizes negative extents", () => {
    expect(collision.aabb(10, 20, -4, -6)).toEqual({
      minX: 6,
      minY: 14,
      maxX: 10,
      maxY: 20,
    });
  });

  test("circle rejects a radius that cannot describe geometry", () => {
    expect(() => collision.circle(0, 0, -1)).toThrow(RangeError);
    expect(() => collision.circle(0, 0, Infinity)).toThrow(RangeError);
  });
});

describe("point containment", () => {
  const box = collision.aabb(10, 20, 30, 40);
  const shape = collision.circle(10, 10, 5);

  test("aabb includes its edges", () => {
    expect(collision.containsPointAabb(box, vec2.vec2(10, 20))).toBe(true);
    expect(collision.containsPointAabb(box, vec2.vec2(40, 60))).toBe(true);
    expect(collision.containsPointAabb(box, vec2.vec2(9.999, 20))).toBe(false);
  });

  test("circle includes its circumference", () => {
    expect(collision.containsPointCircle(shape, vec2.vec2(13, 14))).toBe(true);
    expect(collision.containsPointCircle(shape, vec2.vec2(15, 10))).toBe(true);
    expect(collision.containsPointCircle(shape, vec2.vec2(15.001, 10))).toBe(false);
  });
});

describe("static overlap", () => {
  test("aabb overlap is symmetric and includes touching edges", () => {
    const a = collision.aabb(0, 0, 10, 10);
    const touching = collision.aabb(10, 2, 5, 5);
    const separate = collision.aabb(10.001, 2, 5, 5);
    expect(collision.overlapsAabb(a, touching)).toBe(true);
    expect(collision.overlapsAabb(touching, a)).toBe(true);
    expect(collision.overlapsAabb(a, separate)).toBe(false);
  });

  test("circle overlap includes tangency", () => {
    const a = collision.circle(0, 0, 4);
    expect(collision.overlapsCircle(a, collision.circle(7, 0, 3))).toBe(true);
    expect(collision.overlapsCircle(a, collision.circle(7.001, 0, 3))).toBe(false);
  });

  test("circle-aabb checks corners rather than only the centre", () => {
    const box = collision.aabb(0, 0, 10, 10);
    expect(collision.overlapsCircleAabb(collision.circle(13, 14, 5), box)).toBe(true);
    expect(collision.overlapsCircleAabb(collision.circle(13.1, 14.1, 5), box)).toBe(false);
  });
});

describe("raycastAabb", () => {
  const box = collision.aabb(5, 5, 10, 10);

  test("reports distance, point, and entry normal", () => {
    const hit = collision.raycastAabb(vec2.vec2(0, 10), vec2.vec2(4, 0), box);
    expect(hit).toEqual({ x: 5, y: 10, normalX: -1, normalY: 0, distance: 5 });
  });

  test("honours max distance and parallel misses", () => {
    expect(collision.raycastAabb(vec2.vec2(0, 10), vec2.vec2(1, 0), box, 4.999)).toBeNull();
    expect(collision.raycastAabb(vec2.vec2(0, 0), vec2.vec2(1, 0), box)).toBeNull();
    expect(collision.raycastAabb(vec2.vec2(0, 0), vec2.ZERO2, box)).toBeNull();
  });

  test("a start inside is an immediate hit", () => {
    expect(collision.raycastAabb(vec2.vec2(10, 10), vec2.ZERO2, box)).toEqual({
      x: 10,
      y: 10,
      normalX: 0,
      normalY: 0,
      distance: 0,
    });
  });

  test("corner impacts return a unit diagonal normal", () => {
    const hit = collision.raycastAabb(vec2.ZERO2, vec2.vec2(1, 1), box);
    expect(hit?.x).toBeCloseTo(5);
    expect(hit?.y).toBeCloseTo(5);
    expect(hit?.normalX).toBeCloseTo(-Math.SQRT1_2);
    expect(hit?.normalY).toBeCloseTo(-Math.SQRT1_2);
    expect(hit?.distance).toBeCloseTo(Math.sqrt(50));
  });

  test("writes into a reusable result", () => {
    const out = collision.createRayHit();
    expect(collision.raycastAabb(vec2.vec2(0, 10), vec2.vec2(1, 0), box, 20, out)).toBe(out);
  });
});

describe("raycastCircle", () => {
  const shape = collision.circle(10, 0, 2);

  test("hits the near surface with a normalized direction", () => {
    expect(collision.raycastCircle(vec2.ZERO2, vec2.vec2(20, 0), shape)).toEqual({
      x: 8,
      y: 0,
      normalX: -1,
      normalY: 0,
      distance: 8,
    });
  });

  test("detects a tangent and rejects a ray pointing away", () => {
    const tangent = collision.raycastCircle(vec2.vec2(0, 2), vec2.vec2(1, 0), shape);
    expect(tangent?.distance).toBeCloseTo(10);
    expect(tangent?.normalX).toBeCloseTo(0);
    expect(tangent?.normalY).toBeCloseTo(1);
    expect(collision.raycastCircle(vec2.ZERO2, vec2.vec2(-1, 0), shape)).toBeNull();
  });

  test("a start inside is immediate and can reuse output", () => {
    const out = collision.createRayHit();
    const hit = collision.raycastCircle(vec2.vec2(10, 1), vec2.ZERO2, shape, 0, out);
    expect(hit).toBe(out);
    expect(out).toEqual({ x: 10, y: 1, normalX: 0, normalY: 1, distance: 0 });
  });
});

describe("sweepAabb", () => {
  const moving = collision.aabb(0, 0, 2, 2);
  const target = collision.aabb(10, 0, 2, 2);

  test("finds an impact that discrete overlap would tunnel through", () => {
    const delta = vec2.vec2(20, 0);
    expect(collision.overlapsAabb(collision.aabb(20, 0, 2, 2), target)).toBe(false);
    expect(collision.sweepAabb(moving, delta, target)).toEqual({
      time: 0.4,
      normalX: -1,
      normalY: 0,
    });
  });

  test("rejects a miss, zero movement, and touching movement away", () => {
    expect(collision.sweepAabb(moving, vec2.vec2(20, 0), collision.aabb(10, 3, 2, 2))).toBeNull();
    expect(collision.sweepAabb(moving, vec2.ZERO2, target)).toBeNull();
    const touching = collision.aabb(2, 0, 2, 2);
    expect(collision.sweepAabb(moving, vec2.vec2(-1, 0), touching)).toBeNull();
    expect(collision.sweepAabb(moving, vec2.vec2(1, 0), touching)?.time).toBe(0);
  });

  test("allows movement tangent to a touching edge", () => {
    const diagonal = collision.aabb(2, 2, 2, 2);
    expect(collision.sweepAabb(moving, vec2.vec2(0, 1), diagonal)).toBeNull();
    expect(collision.sweepAabb(moving, vec2.vec2(1, 0), diagonal)).toBeNull();
  });

  test("reports initial penetration and reuses output", () => {
    const out = collision.createSweepHit();
    const overlap = collision.aabb(1, 0, 2, 2);
    expect(collision.sweepAabb(moving, vec2.vec2(1, 0), overlap, out)).toBe(out);
    expect(out).toEqual({ time: 0, normalX: -1, normalY: 0 });
  });

  test("corner impacts expose both blocking axes", () => {
    const hit = collision.sweepAabb(moving, vec2.vec2(4, 4), collision.aabb(4, 4, 2, 2));
    expect(hit?.time).toBe(0.5);
    expect(hit?.normalX).toBeCloseTo(-Math.SQRT1_2);
    expect(hit?.normalY).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe("sweepCircle", () => {
  const moving = collision.circle(0, 0, 1);
  const target = collision.circle(10, 0, 2);

  test("finds the earliest circle impact", () => {
    expect(collision.sweepCircle(moving, vec2.vec2(20, 0), target)).toEqual({
      time: 0.35,
      normalX: -1,
      normalY: 0,
    });
  });

  test("rejects misses and touching movement away", () => {
    expect(collision.sweepCircle(moving, vec2.vec2(20, 0), collision.circle(10, 4, 2))).toBeNull();
    const touching = collision.circle(2, 0, 1);
    expect(collision.sweepCircle(moving, vec2.vec2(-1, 0), touching)).toBeNull();
    expect(collision.sweepCircle(moving, vec2.vec2(1, 0), touching)?.time).toBe(0);
  });

  test("reports initial overlap with a stable normal and reusable output", () => {
    const out = collision.createSweepHit();
    const overlap = collision.circle(1, 0, 1);
    expect(collision.sweepCircle(moving, vec2.vec2(4, 0), overlap, out)).toBe(out);
    expect(out).toEqual({ time: 0, normalX: -1, normalY: 0 });
  });
});
