import { describe, expect, test } from "bun:test";
import {
  clampToGamut,
  fromSrgb,
  inGamut,
  linearize,
  delinearize,
  oklch,
  rgb,
  toLinearRgb,
  toSrgb,
} from "../src/index";

describe("rgb()", () => {
  test("takes 0-255 channels and returns OKLCH", () => {
    const red = rgb(255, 0, 0);
    const back = toSrgb(red);
    expect(back.r).toBeCloseTo(1, 5);
    expect(back.g).toBeCloseTo(0, 5);
    expect(back.b).toBeCloseTo(0, 5);
    expect(back.alpha).toBe(1);
  });

  test("alpha is 0-1", () => {
    expect(rgb(0, 0, 0, 0.4).alpha).toBeCloseTo(0.4);
  });

  test("clamps out-of-range channels", () => {
    const bright = toSrgb(rgb(400, -10, 128));
    expect(bright.r).toBeCloseTo(1, 5);
    expect(bright.g).toBeCloseTo(0, 5);
    expect(bright.b).toBeCloseTo(128 / 255, 5);
  });

  test("rejects non-finite components", () => {
    expect(() => rgb(Number.NaN, 0, 0)).toThrow(RangeError);
    expect(() => rgb(0, 0, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("sRGB transfer function", () => {
  test("round-trips", () => {
    for (let i = 0; i <= 100; i++) {
      const c = i / 100;
      expect(delinearize(linearize(c))).toBeCloseTo(c, 10);
    }
  });

  test("pins its endpoints", () => {
    expect(linearize(0)).toBe(0);
    expect(linearize(1)).toBeCloseTo(1, 10);
    expect(delinearize(0)).toBe(0);
    expect(delinearize(1)).toBeCloseTo(1, 10);
  });

  test("is continuous across the piecewise boundary", () => {
    const below = linearize(0.04045 - 1e-9);
    const above = linearize(0.04045 + 1e-9);
    expect(Math.abs(above - below)).toBeLessThan(1e-6);
  });
});

describe("sRGB <-> OKLCH round-trip", () => {
  /**
   * The strongest available check on the conversion chain: sRGB -> linear ->
   * Oklab -> Oklch and all the way back must be the identity. A wrong
   * coefficient anywhere shows up here.
   */
  test("recovers arbitrary colours", () => {
    const samples = [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.5, 0.25, 0.75],
      [0.2, 0.9, 0.4],
      [0.13, 0.13, 0.13],
      [0.99, 0.01, 0.5],
    ] as const;

    for (const [r, g, b] of samples) {
      const back = toSrgb(fromSrgb({ r, g, b, alpha: 1 }));
      expect(back.r).toBeCloseTo(r, 5);
      expect(back.g).toBeCloseTo(g, 5);
      expect(back.b).toBeCloseTo(b, 5);
    }
  });

  test("recovers a dense sweep of the cube", () => {
    let worst = 0;
    for (let r = 0; r <= 1.0001; r += 0.2) {
      for (let g = 0; g <= 1.0001; g += 0.2) {
        for (let b = 0; b <= 1.0001; b += 0.2) {
          const back = toSrgb(fromSrgb({ r, g, b, alpha: 1 }));
          worst = Math.max(worst, Math.abs(back.r - r), Math.abs(back.g - g), Math.abs(back.b - b));
        }
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  test("preserves alpha", () => {
    expect(toSrgb(fromSrgb({ r: 0.5, g: 0.5, b: 0.5, alpha: 0.25 })).alpha).toBeCloseTo(0.25);
  });
});

describe("known landmarks", () => {
  test("white is L=1 with no chroma", () => {
    const white = fromSrgb({ r: 1, g: 1, b: 1, alpha: 1 });
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
  });

  test("black is L=0", () => {
    const black = fromSrgb({ r: 0, g: 0, b: 0, alpha: 1 });
    expect(black.l).toBeCloseTo(0, 5);
    expect(black.c).toBeCloseTo(0, 5);
  });

  test("greys have no chroma at any lightness", () => {
    for (const v of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(fromSrgb({ r: v, g: v, b: v, alpha: 1 }).c).toBeCloseTo(0, 4);
    }
  });

  test("hue is reported as 0 for achromatic colours rather than noise", () => {
    expect(fromSrgb({ r: 0.5, g: 0.5, b: 0.5, alpha: 1 }).h).toBe(0);
  });

  test("primaries land in the expected hue quadrants", () => {
    const red = fromSrgb({ r: 1, g: 0, b: 0, alpha: 1 });
    const green = fromSrgb({ r: 0, g: 1, b: 0, alpha: 1 });
    const blue = fromSrgb({ r: 0, g: 0, b: 1, alpha: 1 });
    expect(red.h).toBeGreaterThan(20);
    expect(red.h).toBeLessThan(45);
    expect(green.h).toBeGreaterThan(120);
    expect(green.h).toBeLessThan(160);
    expect(blue.h).toBeGreaterThan(250);
    expect(blue.h).toBeLessThan(290);
    for (const c of [red, green, blue]) expect(c.c).toBeGreaterThan(0.1);
  });
});

describe("gamut mapping", () => {
  test("recognises in- and out-of-gamut colours", () => {
    expect(inGamut(fromSrgb({ r: 0.5, g: 0.5, b: 0.5, alpha: 1 }))).toBe(true);
    // Far more chroma than sRGB can show.
    expect(inGamut(oklch(0.7, 0.4, 250))).toBe(false);
  });

  test("leaves in-gamut colours untouched", () => {
    const c = fromSrgb({ r: 0.3, g: 0.6, b: 0.9, alpha: 1 });
    expect(clampToGamut(c)).toBe(c);
  });

  test("reduces chroma while preserving hue and lightness", () => {
    const wild = oklch(0.7, 0.4, 250);
    const mapped = clampToGamut(wild);
    expect(mapped.c).toBeLessThan(wild.c);
    expect(mapped.h).toBe(wild.h);
    expect(mapped.l).toBe(wild.l);
    expect(inGamut(mapped)).toBe(true);
  });

  test("handles lightness outside [0, 1]", () => {
    expect(inGamut(clampToGamut(oklch(1.5, 0.2, 100)))).toBe(true);
    expect(inGamut(clampToGamut(oklch(-0.5, 0.2, 100)))).toBe(true);
  });

  test("toSrgb never emits components outside [0, 1]", () => {
    for (let h = 0; h < 360; h += 15) {
      const srgb = toSrgb(oklch(0.7, 0.4, h));
      for (const v of [srgb.r, srgb.g, srgb.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  test("toLinearRgb is deliberately unclamped", () => {
    // The GPU path wants the raw value; clamping is the display step's job.
    const linear = toLinearRgb(oklch(0.7, 0.4, 250));
    expect(
      linear.r < 0 || linear.g < 0 || linear.b < 0 || linear.r > 1 || linear.g > 1 || linear.b > 1,
    ).toBe(true);
  });
});
