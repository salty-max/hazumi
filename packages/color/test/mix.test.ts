import { describe, expect, test } from "bun:test";
import {
  darken,
  gradient,
  lighten,
  mix,
  oklch,
  parse,
  rotateHue,
  toSrgb,
  withAlpha,
} from "../src/index";

describe("mix", () => {
  test("returns the endpoints at t=0 and t=1", () => {
    const a = oklch(0.3, 0.1, 30);
    const b = oklch(0.8, 0.2, 200);
    expect(mix(a, b, 0).l).toBeCloseTo(a.l);
    expect(mix(a, b, 0).h).toBeCloseTo(a.h);
    expect(mix(a, b, 1).l).toBeCloseTo(b.l);
    expect(mix(a, b, 1).h).toBeCloseTo(b.h);
  });

  test("takes the short way around the hue wheel", () => {
    // 350 -> 10 should pass through 0, not sweep down through 180.
    const m = mix(oklch(0.5, 0.1, 350), oklch(0.5, 0.1, 10), 0.5);
    expect(m.h).toBeCloseTo(0, 4);
  });

  test("crosses the 0/360 seam in both directions", () => {
    expect(mix(oklch(0.5, 0.1, 10), oklch(0.5, 0.1, 350), 0.5).h).toBeCloseTo(0, 4);
  });

  test("always reports hue in [0, 360)", () => {
    for (let i = 0; i <= 20; i++) {
      const h = mix(oklch(0.5, 0.1, 350), oklch(0.5, 0.1, 20), i / 20).h;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  test("does not desaturate through the midpoint", () => {
    // The whole reason for storing OKLCH: in sRGB, blue-to-yellow passes
    // through grey. Here chroma stays at least as high as the lower endpoint.
    const a = parse("#0000ff");
    const b = parse("#ffff00");
    const midpoint = mix(a, b, 0.5);
    expect(midpoint.c).toBeGreaterThan(Math.min(a.c, b.c) * 0.5);

    // And the rendered midpoint is not grey.
    const srgb = toSrgb(midpoint);
    const spread = Math.max(srgb.r, srgb.g, srgb.b) - Math.min(srgb.r, srgb.g, srgb.b);
    expect(spread).toBeGreaterThan(0.15);
  });

  test("adopts the chromatic endpoint hue when one side is grey", () => {
    // A grey endpoint has no meaningful hue; sweeping toward an arbitrary one
    // would tint the blend.
    const grey = oklch(0.5, 0, 0);
    const blue = oklch(0.5, 0.15, 250);
    for (let i = 0; i <= 10; i++) {
      expect(mix(grey, blue, i / 10).h).toBeCloseTo(250, 4);
    }
    for (let i = 0; i <= 10; i++) {
      expect(mix(blue, grey, i / 10).h).toBeCloseTo(250, 4);
    }
  });

  test("two greys stay grey", () => {
    const m = mix(oklch(0.2, 0, 0), oklch(0.8, 0, 0), 0.5);
    expect(m.c).toBe(0);
    expect(m.l).toBeCloseTo(0.5);
  });

  test("interpolates alpha", () => {
    expect(
      mix(withAlpha(oklch(0.5, 0.1, 0), 0), withAlpha(oklch(0.5, 0.1, 0), 1), 0.5).alpha,
    ).toBeCloseTo(0.5);
  });
});

describe("gradient", () => {
  test("includes both endpoints", () => {
    const a = oklch(0.2, 0.1, 20);
    const b = oklch(0.9, 0.15, 200);
    const steps = gradient(a, b, 5);
    expect(steps).toHaveLength(5);
    expect(steps[0]?.l).toBeCloseTo(a.l);
    expect(steps[4]?.l).toBeCloseTo(b.l);
  });

  test("lightness increases monotonically", () => {
    const steps = gradient(oklch(0.1, 0.1, 20), oklch(0.9, 0.1, 20), 10);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.l).toBeGreaterThan(steps[i - 1]!.l);
    }
  });

  test("rejects degenerate step counts", () => {
    expect(() => gradient(oklch(0, 0, 0), oklch(1, 0, 0), 1)).toThrow(/at least 2/);
  });
});

describe("adjustments", () => {
  test("lighten and darken move lightness and clamp", () => {
    const c = oklch(0.5, 0.1, 100);
    expect(lighten(c, 0.2).l).toBeCloseTo(0.7);
    expect(darken(c, 0.2).l).toBeCloseTo(0.3);
    expect(lighten(c, 5).l).toBe(1);
    expect(darken(c, 5).l).toBe(0);
  });

  test("lighten preserves hue and chroma", () => {
    const c = oklch(0.5, 0.12, 100);
    expect(lighten(c, 0.1).h).toBe(100);
    expect(lighten(c, 0.1).c).toBe(0.12);
  });

  test("withAlpha clamps", () => {
    expect(withAlpha(oklch(0.5, 0, 0), 2).alpha).toBe(1);
    expect(withAlpha(oklch(0.5, 0, 0), -1).alpha).toBe(0);
  });

  test("rotateHue wraps around the wheel", () => {
    expect(rotateHue(oklch(0.5, 0.1, 350), 20).h).toBeCloseTo(10);
    expect(rotateHue(oklch(0.5, 0.1, 10), -20).h).toBeCloseTo(350);
    expect(rotateHue(oklch(0.5, 0.1, 0), 720).h).toBeCloseTo(0);
  });
});
