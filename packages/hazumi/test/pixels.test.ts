import { describe, expect, test } from "bun:test";
import { Pixels } from "../src/pixels";

describe("Pixels", () => {
  test("reads and writes top-down RGBA pixels", () => {
    const pixels = new Pixels(2, 2, 2);
    pixels.set(1, 0, [300, -4, 32, 255]);

    expect(pixels.get(1, 0)).toEqual([255, 0, 32, 255]);
    expect(Array.from(pixels.data.slice(4, 8))).toEqual([255, 0, 32, 255]);
    expect(pixels.pixelRatio).toBe(2);
  });

  test("supports a reusable output in pixel loops", () => {
    const pixels = new Pixels(1, 1, 1, new Uint8ClampedArray([1, 2, 3, 4]));
    const out: [number, number, number, number] = [0, 0, 0, 0];

    expect(pixels.get(0, 0, out)).toBe(out);
    expect(out).toEqual([1, 2, 3, 4]);
  });

  test("rejects malformed surfaces and out-of-bounds coordinates", () => {
    expect(() => new Pixels(0, 1, 1)).toThrow(RangeError);
    expect(() => new Pixels(1, 1, 1, new Uint8ClampedArray(3))).toThrow(RangeError);
    const pixels = new Pixels(2, 2, 1);
    expect(() => pixels.get(-1, 0)).toThrow(RangeError);
    expect(() => pixels.set(2, 0, [0, 0, 0, 0])).toThrow(RangeError);
  });
});
