import { describe, expect, test } from "bun:test";
import { mat4 } from "../src/index";

describe("mat4", () => {
  test("starts as identity", () => {
    const m = mat4.mat4();
    expect(Array.from(m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  test("identity resets in place", () => {
    const m = mat4.mat4();
    m[3] = 9;
    mat4.identity(m);
    expect(m[3]).toBe(0);
    expect(m[0]).toBe(1);
  });

  test("multiplying by identity is a no-op", () => {
    const a = mat4.mat4();
    mat4.translate(a, a, 3, 4, 5);
    const out = mat4.mat4();
    mat4.multiply(out, a, mat4.mat4());
    expect(mat4.equals(out, a)).toBe(true);
  });

  test("multiply is correct when out aliases an input", () => {
    const a = mat4.mat4();
    mat4.rotateZ(a, a, 0.3);
    const b = mat4.mat4();
    mat4.translate(b, b, 1, 2, 3);

    const expected = mat4.multiply(mat4.mat4(), a, b);
    // Aliasing is the case that breaks naive implementations.
    const aliased = mat4.copy(mat4.mat4(), a);
    mat4.multiply(aliased, aliased, b);

    expect(mat4.equals(aliased, expected)).toBe(true);
  });

  test("translate moves a point", () => {
    const m = mat4.mat4();
    mat4.translate(m, m, 10, 20, 0);
    const out = { x: 0, y: 0 };
    mat4.transformPoint2(m, 1, 2, out);
    expect(out.x).toBeCloseTo(11);
    expect(out.y).toBeCloseTo(22);
  });

  test("scale scales a point", () => {
    const m = mat4.mat4();
    mat4.scale(m, m, 2, 3, 1);
    const out = { x: 0, y: 0 };
    mat4.transformPoint2(m, 4, 5, out);
    expect(out.x).toBeCloseTo(8);
    expect(out.y).toBeCloseTo(15);
  });

  test("rotateZ rotates a point a quarter turn", () => {
    const m = mat4.mat4();
    mat4.rotateZ(m, m, Math.PI / 2);
    const out = { x: 0, y: 0 };
    mat4.transformPoint2(m, 1, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
  });

  test("transforms compose in the expected order", () => {
    // Translate then rotate: the rotation happens about the translated origin.
    const m = mat4.mat4();
    mat4.translate(m, m, 10, 0, 0);
    mat4.rotateZ(m, m, Math.PI / 2);
    const out = { x: 0, y: 0 };
    mat4.transformPoint2(m, 1, 0, out);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(1);
  });

  test("ortho maps screen space to clip space with origin top-left", () => {
    const m = mat4.mat4();
    mat4.ortho(m, 0, 800, 600, 0, -1, 1);
    const out = { x: 0, y: 0 };

    // Top-left corner -> (-1, 1)
    mat4.transformPoint2(m, 0, 0, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(1);

    // Bottom-right corner -> (1, -1)
    mat4.transformPoint2(m, 800, 600, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(-1);

    // Centre -> origin
    mat4.transformPoint2(m, 400, 300, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
  });

  test("perspective produces the standard projection layout", () => {
    const m = mat4.mat4();
    mat4.perspective(m, Math.PI / 2, 1, 1, 100);
    // f = 1/tan(45deg) = 1
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(1);
    // The -1 in [11] is what performs the perspective divide.
    expect(m[11]).toBe(-1);
    expect(m[15]).toBe(0);
  });

  test("copy and equals", () => {
    const a = mat4.mat4();
    mat4.translate(a, a, 1, 2, 3);
    const b = mat4.copy(mat4.mat4(), a);
    expect(mat4.equals(a, b)).toBe(true);
    b[12] = 99;
    expect(mat4.equals(a, b)).toBe(false);
  });
});
