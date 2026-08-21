import { describe, expect, test } from "bun:test";
import { vec2, vec3 } from "../src/index";

describe("vec2", () => {
  test("arithmetic", () => {
    const a = vec2.vec2(1, 2);
    const b = vec2.vec2(3, 4);
    expect(vec2.add(a, b)).toEqual({ x: 4, y: 6 });
    expect(vec2.sub(b, a)).toEqual({ x: 2, y: 2 });
    expect(vec2.scale(a, 3)).toEqual({ x: 3, y: 6 });
    expect(vec2.mul(a, b)).toEqual({ x: 3, y: 8 });
    expect(vec2.negate(a)).toEqual({ x: -1, y: -2 });
  });

  test("dot and cross", () => {
    expect(vec2.dot(vec2.vec2(1, 0), vec2.vec2(0, 1))).toBe(0);
    expect(vec2.dot(vec2.vec2(2, 3), vec2.vec2(4, 5))).toBe(23);
    // Cross sign reports winding.
    expect(vec2.cross(vec2.vec2(1, 0), vec2.vec2(0, 1))).toBe(1);
    expect(vec2.cross(vec2.vec2(0, 1), vec2.vec2(1, 0))).toBe(-1);
  });

  test("length and distance", () => {
    expect(vec2.length(vec2.vec2(3, 4))).toBe(5);
    expect(vec2.lengthSq(vec2.vec2(3, 4))).toBe(25);
    expect(vec2.distance(vec2.vec2(0, 0), vec2.vec2(3, 4))).toBe(5);
    expect(vec2.distanceSq(vec2.vec2(0, 0), vec2.vec2(3, 4))).toBe(25);
  });

  test("normalize yields unit length", () => {
    const n = vec2.normalize(vec2.vec2(3, 4));
    expect(vec2.length(n)).toBeCloseTo(1);
  });

  test("normalizing the zero vector does not produce NaN", () => {
    // The obvious implementation divides by zero here.
    expect(vec2.normalize(vec2.vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });

  test("withLength and limit", () => {
    expect(vec2.length(vec2.withLength(vec2.vec2(3, 4), 10))).toBeCloseTo(10);
    // Under the cap, the vector is returned untouched.
    const short = vec2.vec2(1, 0);
    expect(vec2.limit(short, 5)).toBe(short);
    expect(vec2.length(vec2.limit(vec2.vec2(10, 0), 5))).toBeCloseTo(5);
  });

  test("rotate preserves length and composes", () => {
    const v = vec2.vec2(1, 0);
    const r = vec2.rotate(v, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
    expect(vec2.length(r)).toBeCloseTo(1);

    const full = vec2.rotate(vec2.rotate(v, Math.PI), Math.PI);
    expect(vec2.equals(full, v, 1e-9)).toBe(true);
  });

  test("heading and fromAngle round-trip", () => {
    for (const angle of [0, 0.5, 1.5, -2]) {
      expect(vec2.heading(vec2.fromAngle(angle))).toBeCloseTo(angle);
    }
    expect(vec2.length(vec2.fromAngle(1, 7))).toBeCloseTo(7);
  });

  test("perpendicular is orthogonal", () => {
    const v = vec2.vec2(3, 4);
    expect(vec2.dot(v, vec2.perpendicular(v))).toBe(0);
  });

  test("lerp", () => {
    expect(vec2.lerp(vec2.vec2(0, 0), vec2.vec2(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
  });

  test("equals honours epsilon", () => {
    expect(vec2.equals(vec2.vec2(1, 1), vec2.vec2(1 + 1e-9, 1))).toBe(true);
    expect(vec2.equals(vec2.vec2(1, 1), vec2.vec2(1.1, 1))).toBe(false);
  });
});

describe("vec3", () => {
  test("arithmetic", () => {
    const a = vec3.vec3(1, 2, 3);
    const b = vec3.vec3(4, 5, 6);
    expect(vec3.add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
    expect(vec3.sub(b, a)).toEqual({ x: 3, y: 3, z: 3 });
    expect(vec3.scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(vec3.dot(a, b)).toBe(32);
  });

  test("cross is orthogonal to both inputs", () => {
    const a = vec3.vec3(1, 0, 0);
    const b = vec3.vec3(0, 1, 0);
    const c = vec3.cross(a, b);
    expect(c).toEqual({ x: 0, y: 0, z: 1 });
    expect(vec3.dot(c, a)).toBe(0);
    expect(vec3.dot(c, b)).toBe(0);
  });

  test("length, distance, normalize", () => {
    expect(vec3.length(vec3.vec3(2, 3, 6))).toBe(7);
    expect(vec3.lengthSq(vec3.vec3(2, 3, 6))).toBe(49);
    expect(vec3.distance(vec3.ZERO3, vec3.vec3(2, 3, 6))).toBe(7);
    expect(vec3.length(vec3.normalize(vec3.vec3(2, 3, 6)))).toBeCloseTo(1);
    expect(vec3.normalize(vec3.ZERO3)).toEqual({ x: 0, y: 0, z: 0 });
  });

  test("lerp and equals", () => {
    expect(vec3.lerp(vec3.ZERO3, vec3.vec3(2, 4, 6), 0.5)).toEqual({ x: 1, y: 2, z: 3 });
    expect(vec3.equals(vec3.vec3(1, 1, 1), vec3.vec3(1 + 1e-9, 1, 1))).toBe(true);
  });
});
