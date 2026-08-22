import { describe, expect, test } from "bun:test";
import {
  copyAffine,
  identityAffine,
  resetAffine,
  rotateAffine,
  scaleAffine,
  scaleFactor,
  translateAffine,
} from "../src/affine";

describe("affine", () => {
  test("identity leaves a point unchanged", () => {
    const m = identityAffine();
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });

  test("translate adds in the current basis", () => {
    const m = identityAffine();
    translateAffine(m, 10, 20);
    expect(m.tx).toBe(10);
    expect(m.ty).toBe(20);
  });

  test("a 90 degree rotate sends (1, 0) to (0, 1)", () => {
    const m = identityAffine();
    rotateAffine(m, Math.PI / 2);
    expect(m.a).toBeCloseTo(0);
    expect(m.b).toBeCloseTo(1);
    expect(m.c).toBeCloseTo(-1);
    expect(m.d).toBeCloseTo(0);
  });

  test("scale multiplies the linear part", () => {
    const m = identityAffine();
    scaleAffine(m, 2, 3);
    expect(m.a).toBe(2);
    expect(m.d).toBe(3);
  });

  test("T then R then S composes as m = m * T * R * S", () => {
    const m = identityAffine();
    translateAffine(m, 10, 0);
    rotateAffine(m, Math.PI / 2);
    scaleAffine(m, 2, 2);
    // (1, 0) → scale (2, 0) → rotate (0, 2) → translate (10, 2)
    const x = m.a + m.tx;
    const y = m.b + m.ty;
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(2);
  });

  test("copy and reset do not allocate a replacement", () => {
    const m = identityAffine();
    translateAffine(m, 4, 5);
    const out = identityAffine();
    copyAffine(out, m);
    expect(out).toEqual(m);
    resetAffine(out);
    expect(out).toEqual(identityAffine());
  });

  test("scaleFactor is sqrt(|det|)", () => {
    const m = identityAffine();
    expect(scaleFactor(m)).toBe(1);
    scaleAffine(m, 2, 8);
    expect(scaleFactor(m)).toBeCloseTo(4);
  });
});
