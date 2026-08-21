import { describe, expect, test } from "bun:test";
import { pixelsToUpload, readbackToPixels } from "../src/renderer";

describe("WebGL pixel conversion", () => {
  test("readback flips rows and converts premultiplied alpha to straight RGBA", () => {
    const bottomUp = new Uint8Array([25, 50, 75, 128, 4, 5, 6, 255, 1, 2, 3, 255, 0, 0, 0, 0]);

    expect(Array.from(readbackToPixels(bottomUp, 2, 2))).toEqual([
      1, 2, 3, 255, 0, 0, 0, 0, 50, 100, 149, 128, 4, 5, 6, 255,
    ]);
  });

  test("upload flips rows and premultiplies straight alpha", () => {
    const topDown = new Uint8ClampedArray([
      1, 2, 3, 255, 10, 20, 30, 0, 50, 100, 150, 128, 4, 5, 6, 255,
    ]);

    expect(Array.from(pixelsToUpload(topDown, 2, 2))).toEqual([
      25, 50, 75, 128, 4, 5, 6, 255, 1, 2, 3, 255, 0, 0, 0, 0,
    ]);
  });

  test("round-trips representable RGBA values", () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 64, 128, 192, 128]);

    expect(Array.from(readbackToPixels(pixelsToUpload(pixels, 2, 1), 2, 1))).toEqual([
      10, 20, 30, 255, 64, 128, 191, 128,
    ]);
  });
});
