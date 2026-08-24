import { describe, expect, test } from "bun:test";
import { presentWidth } from "../src/lib/fullscreen";

/**
 * A scene keeps its logical size in fullscreen, so the only decision is how
 * wide to draw the box it lands in. Fullscreen itself cannot be exercised in a
 * headless run — it needs a gesture and a permitted frame — so the arithmetic
 * is tested here and the wiring around it is three lines.
 */
describe("presentWidth", () => {
  test("a square scene on a wide screen is limited by the height", () => {
    expect(presentWidth(1200, 1200, { width: 1920, height: 1080 })).toBe(1080);
  });

  test("a square scene on a tall screen is limited by the width", () => {
    expect(presentWidth(1200, 1200, { width: 800, height: 1200 })).toBe(800);
  });

  test("a wide scene keeps its ratio rather than filling the screen", () => {
    // 16:9 art on a 4:3 screen: full width, and the rest is letterbox.
    expect(presentWidth(1600, 900, { width: 1024, height: 768 })).toBe(1024);
  });

  test("a tall scene on a wide screen is limited by the height", () => {
    // 480x640 portrait on 1920x1080: 1080 tall means 810 across.
    expect(presentWidth(480, 640, { width: 1920, height: 1080 })).toBe(810);
  });

  test("it grows past the bitmap rather than refusing to scale up", () => {
    expect(presentWidth(600, 600, { width: 1920, height: 1080 })).toBe(1080);
  });

  test("a canvas with no size asks for none", () => {
    expect(presentWidth(0, 0, { width: 1920, height: 1080 })).toBe(0);
  });
});
