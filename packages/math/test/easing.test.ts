import { describe, expect, test } from "bun:test";
import { easing } from "../src/index";

const ALL = Object.entries(easing).filter(
  ([name]) => name !== "reverse" && name !== "inOut",
) as ReadonlyArray<[string, easing.Easing]>;

// These deliberately leave [0, 1] between the endpoints.
const OVERSHOOTS = new Set(["backIn", "backOut", "elasticOut"]);

describe("easing curves", () => {
  test("there are curves to test", () => {
    expect(ALL.length).toBeGreaterThan(10);
  });

  for (const [name, fn] of ALL) {
    test(`${name} is pinned at both endpoints`, () => {
      expect(fn(0)).toBeCloseTo(0, 6);
      expect(fn(1)).toBeCloseTo(1, 6);
    });

    test(`${name} produces finite values throughout`, () => {
      for (let i = 0; i <= 100; i++) {
        expect(Number.isFinite(fn(i / 100))).toBe(true);
      }
    });

    if (!OVERSHOOTS.has(name)) {
      test(`${name} stays within [0, 1]`, () => {
        for (let i = 0; i <= 100; i++) {
          const v = fn(i / 100);
          expect(v).toBeGreaterThanOrEqual(-1e-6);
          expect(v).toBeLessThanOrEqual(1 + 1e-6);
        }
      });
    }
  }

  test("linear is the identity", () => {
    for (let i = 0; i <= 10; i++) expect(easing.linear(i / 10)).toBe(i / 10);
  });

  test("ease-in starts slow, ease-out starts fast", () => {
    expect(easing.quadIn(0.25)).toBeLessThan(0.25);
    expect(easing.quadOut(0.25)).toBeGreaterThan(0.25);
    expect(easing.cubicIn(0.25)).toBeLessThan(0.25);
    expect(easing.cubicOut(0.25)).toBeGreaterThan(0.25);
  });

  test("in-out curves are symmetric about the midpoint", () => {
    for (const fn of [easing.quadInOut, easing.cubicInOut, easing.sineInOut]) {
      expect(fn(0.5)).toBeCloseTo(0.5, 6);
      for (const t of [0.1, 0.25, 0.4]) {
        expect(fn(t) + fn(1 - t)).toBeCloseTo(1, 6);
      }
    }
  });

  test("back and elastic actually overshoot", () => {
    let below = false;
    let above = false;
    for (let i = 0; i <= 100; i++) {
      if (easing.backIn(i / 100) < 0) below = true;
      if (easing.backOut(i / 100) > 1) above = true;
    }
    expect(below).toBe(true);
    expect(above).toBe(true);
  });

  test("expo handles its endpoint special cases", () => {
    // 2**(10*0-10) is not 0, so these need explicit handling.
    expect(easing.expoIn(0)).toBe(0);
    expect(easing.expoOut(1)).toBe(1);
    expect(easing.expoInOut(0)).toBe(0);
    expect(easing.expoInOut(1)).toBe(1);
  });
});

describe("reverse", () => {
  test("turns an ease-in into its ease-out", () => {
    const derived = easing.reverse(easing.quadIn);
    for (let i = 0; i <= 10; i++) {
      expect(derived(i / 10)).toBeCloseTo(easing.quadOut(i / 10), 6);
    }
  });

  test("is its own inverse", () => {
    const twice = easing.reverse(easing.reverse(easing.cubicIn));
    for (let i = 0; i <= 10; i++) {
      expect(twice(i / 10)).toBeCloseTo(easing.cubicIn(i / 10), 6);
    }
  });
});

describe("inOut", () => {
  test("builds a symmetric curve from an ease-in", () => {
    const derived = easing.inOut(easing.quadIn);
    expect(derived(0)).toBeCloseTo(0, 6);
    expect(derived(0.5)).toBeCloseTo(0.5, 6);
    expect(derived(1)).toBeCloseTo(1, 6);
    expect(derived(0.25) + derived(0.75)).toBeCloseTo(1, 6);
  });

  test("matches the hand-written quadInOut", () => {
    const derived = easing.inOut(easing.quadIn);
    for (let i = 0; i <= 10; i++) {
      expect(derived(i / 10)).toBeCloseTo(easing.quadInOut(i / 10), 6);
    }
  });
});
