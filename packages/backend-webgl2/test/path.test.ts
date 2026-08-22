import { describe, expect, test } from "bun:test";
import { PathBuilder } from "../src/path/builder";
import { fanTriangles, quadTriangles, strokeTriangles } from "../src/path/geometry";

describe("PathBuilder", () => {
  test("collects a contour of straight segments", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.lineTo(10, 0);
    b.lineTo(10, 10);
    expect(b.contours).toEqual([[0, 0, 10, 0, 10, 10]]);
  });

  test("a moveTo starts a new contour", () => {
    // A letter O is two contours; merging them would destroy the winding
    // relationship the fill rule depends on.
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.lineTo(10, 0);
    b.moveTo(20, 20);
    b.lineTo(30, 20);
    expect(b.contours).toHaveLength(2);
  });

  test("close returns to the contour start", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.lineTo(10, 0);
    b.lineTo(10, 10);
    b.close();
    const contour = b.contours[0] as readonly number[];
    expect(contour.slice(-2)).toEqual([0, 0]);
  });

  test("drawing after close continues from the start point", () => {
    // Matching Canvas2D, where the current point after closePath is the
    // subpath's origin rather than wherever the pen was.
    const b = new PathBuilder();
    b.moveTo(5, 5);
    b.lineTo(20, 5);
    b.close();
    b.lineTo(20, 20);
    expect(b.contours).toHaveLength(2);
    expect((b.contours[1] as readonly number[]).slice(0, 2)).toEqual([5, 5]);
  });

  test("a lineTo without a moveTo starts from the origin", () => {
    const b = new PathBuilder();
    b.lineTo(10, 10);
    expect((b.contours[0] as readonly number[]).slice(0, 2)).toEqual([0, 0]);
  });

  test("tighter tolerance produces more segments", () => {
    const loose = new PathBuilder(4);
    loose.moveTo(0, 0);
    loose.cubicTo(0, 100, 100, 100, 100, 0);
    const tight = new PathBuilder(0.05);
    tight.moveTo(0, 0);
    tight.cubicTo(0, 100, 100, 100, 100, 0);
    expect((tight.contours[0] as number[]).length).toBeGreaterThan(
      (loose.contours[0] as number[]).length,
    );

    const scaled = new PathBuilder(4);
    scaled.setTolerance(0.05);
    scaled.moveTo(0, 0);
    scaled.cubicTo(0, 100, 100, 100, 100, 0);
    expect((scaled.contours[0] as number[]).length).toBe((tight.contours[0] as number[]).length);
  });

  test("curves are flattened into the current contour", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.cubicTo(0, 100, 100, 100, 100, 0);
    // One contour, many points, ending exactly on the curve endpoint.
    expect(b.contours).toHaveLength(1);
    const contour = b.contours[0] as readonly number[];
    expect(contour.length).toBeGreaterThan(10);
    expect(contour.slice(-2).map(Math.round)).toEqual([100, 0]);
  });

  test("reports bounds over every contour", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.lineTo(10, 5);
    b.moveTo(-4, -8);
    b.lineTo(2, 2);
    expect(b.bounds()).toEqual({ minX: -4, minY: -8, maxX: 10, maxY: 5 });
  });

  test("an empty path has no bounds", () => {
    expect(new PathBuilder().bounds()).toBeNull();
  });

  test("reset clears everything", () => {
    const b = new PathBuilder();
    b.moveTo(1, 2);
    b.lineTo(3, 4);
    b.reset();
    expect(b.contours).toEqual([]);
    expect(b.bounds()).toBeNull();
  });

  test("isEmpty is true until a contour can enclose area", () => {
    const b = new PathBuilder();
    expect(b.isEmpty).toBe(true);
    b.moveTo(0, 0);
    b.lineTo(10, 0);
    // Two points cannot enclose anything.
    expect(b.isEmpty).toBe(true);
    b.lineTo(10, 10);
    expect(b.isEmpty).toBe(false);
  });
});

describe("fanTriangles", () => {
  test("a triangle produces one fan triangle", () => {
    const out: number[] = [];
    fanTriangles([0, 0, 10, 0, 10, 10], out);
    expect(out).toEqual([0, 0, 10, 0, 10, 10]);
  });

  test("an n-gon produces n-2 triangles", () => {
    const out: number[] = [];
    fanTriangles([0, 0, 10, 0, 10, 10, 0, 10], out);
    expect(out.length / 6).toBe(2);
  });

  test("degenerate contours produce nothing", () => {
    const out: number[] = [];
    fanTriangles([0, 0], out);
    fanTriangles([0, 0, 1, 1], out);
    expect(out).toEqual([]);
  });
});

describe("quadTriangles", () => {
  test("covers the rectangle with two triangles", () => {
    const out: number[] = [];
    quadTriangles(0, 0, 10, 20, out);
    expect(out.length / 6).toBe(2);
    expect(Math.min(...out.filter((_, i) => i % 2 === 0))).toBe(0);
    expect(Math.max(...out.filter((_, i) => i % 2 === 1))).toBe(20);
  });
});

describe("strokeTriangles", () => {
  test("one segment produces two triangles", () => {
    const out: number[] = [];
    strokeTriangles([0, 0, 10, 0], 4, out);
    expect(out.length / 6).toBe(2);
  });

  test("the quad spans the stroke width", () => {
    const out: number[] = [];
    strokeTriangles([0, 0, 10, 0], 4, out);
    const ys = out.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-2);
    expect(Math.max(...ys)).toBeCloseTo(2);
  });

  test("interior vertices get a round join", () => {
    // Two segments alone would be four triangles; the extra ones are the join.
    const straight: number[] = [];
    strokeTriangles([0, 0, 10, 0], 4, straight);
    const bent: number[] = [];
    strokeTriangles([0, 0, 10, 0, 10, 10], 4, bent);
    expect(bent.length).toBeGreaterThan(straight.length * 2);
  });

  test("a zero-length segment is skipped rather than producing NaN", () => {
    // Normalising a zero-length direction is the classic source of NaN
    // vertices, which poison the whole draw call.
    const out: number[] = [];
    strokeTriangles([5, 5, 5, 5, 15, 5], 4, out);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  test("a single point produces nothing", () => {
    const out: number[] = [];
    strokeTriangles([5, 5], 4, out);
    expect(out).toEqual([]);
  });

  test("zero width produces nothing", () => {
    const out: number[] = [];
    strokeTriangles([0, 0, 10, 0], 0, out);
    expect(out).toEqual([]);
  });
});

/**
 * Paths are rebuilt every frame, so allocating a contour array per contour per
 * frame is the per-frame allocation AGENTS.md rules out. The arrays are pooled
 * and truncated instead.
 */
describe("contour pooling", () => {
  test("reuses the same arrays across resets", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.lineTo(1, 1);
    const first = b.contours[0];

    b.reset();
    b.moveTo(2, 2);
    b.lineTo(3, 3);

    // Same backing array, refilled — not a fresh allocation.
    expect(b.contours[0]).toBe(first);
    expect(b.contours[0]).toEqual([2, 2, 3, 3]);
  });

  test("a reset path reports no contours", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.moveTo(5, 5);
    expect(b.contourCount).toBe(2);
    b.reset();
    expect(b.contourCount).toBe(0);
    expect(b.contours).toEqual([]);
  });

  test("stale points never leak into a reused contour", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.lineTo(1, 1);
    b.lineTo(2, 2);
    b.reset();
    b.moveTo(9, 9);
    expect(b.contours[0]).toEqual([9, 9]);
  });

  test("forEachContour visits the same contours as the getter", () => {
    const b = new PathBuilder();
    b.moveTo(0, 0);
    b.lineTo(1, 1);
    b.moveTo(5, 5);
    b.lineTo(6, 6);

    const seen: number[][] = [];
    b.forEachContour((c) => void seen.push([...c]));

    const viaGetter: number[][] = [];
    for (const c of b.contours) viaGetter.push([...c]);

    expect(seen).toEqual(viaGetter);
  });

  test("the pool grows to the deepest path and stops", () => {
    const b = new PathBuilder();
    for (let i = 0; i < 5; i++) b.moveTo(i, i);
    expect(b.contourCount).toBe(5);

    b.reset();
    for (let i = 0; i < 3; i++) b.moveTo(i, i);
    // Only three in use, but the two spare arrays are retained.
    expect(b.contourCount).toBe(3);
    expect(b.contours).toHaveLength(3);
  });
});
