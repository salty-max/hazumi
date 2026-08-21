import { describe, expect, test } from "bun:test";
import {
  angleDelta,
  clamp,
  degrees,
  lerp,
  norm,
  radians,
  remap,
  smoothstep,
  wrap,
} from "../src/index";

describe("lerp", () => {
  test("hits both endpoints exactly", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });
  test("interpolates and extrapolates", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe("clamp", () => {
  test("bounds on both sides", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("norm", () => {
  test("inverts lerp", () => {
    expect(norm(5, 0, 10)).toBe(0.5);
  });
  test("returns 0 for a degenerate range rather than dividing by zero", () => {
    expect(norm(5, 3, 3)).toBe(0);
  });
});

describe("remap", () => {
  test("maps between ranges", () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
  });
  test("extrapolates unless clamped", () => {
    expect(remap(20, 0, 10, 0, 100)).toBe(200);
    expect(remap(20, 0, 10, 0, 100, true)).toBe(100);
  });
  test("clamps correctly when the output range is inverted", () => {
    expect(remap(20, 0, 10, 100, 0, true)).toBe(0);
    expect(remap(-5, 0, 10, 100, 0, true)).toBe(100);
  });
});

describe("degrees and radians", () => {
  test("round-trip", () => {
    expect(degrees(Math.PI)).toBeCloseTo(180);
    expect(radians(180)).toBeCloseTo(Math.PI);
    expect(degrees(radians(37))).toBeCloseTo(37);
  });
});

describe("wrap", () => {
  test("stays positive for negative input", () => {
    expect(wrap(-90, 360)).toBe(270);
    expect(wrap(370, 360)).toBe(10);
    expect(wrap(0, 360)).toBe(0);
  });
});

describe("angleDelta", () => {
  test("takes the short way around", () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 0)).toBe(0);
  });
  test("never exceeds half a turn", () => {
    for (let a = 0; a < 360; a += 17) {
      for (let b = 0; b < 360; b += 23) {
        expect(Math.abs(angleDelta(a, b))).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("smoothstep", () => {
  test("pins the endpoints and eases between", () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });
  test("clamps outside the edges", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });
});
