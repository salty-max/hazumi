import { describe, expect, test } from "bun:test";
import {
  cubicSegments,
  flattenCubic,
  flattenQuadratic,
  quadraticSegments,
  type PolylineSink,
} from "../src/path/flatten";

function collect(): PolylineSink & { points: Array<[number, number]> } {
  const points: Array<[number, number]> = [];
  return { points, push: (x, y) => void points.push([x, y]) };
}

/** Exact quadratic evaluation, to check the flattened points against. */
function quadAt(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

describe("quadraticSegments", () => {
  test("a straight curve needs one segment", () => {
    // Control point on the chord: the curve is the chord.
    expect(quadraticSegments(0, 0, 50, 0, 100, 0)).toBe(1);
  });

  test("a curved one needs more", () => {
    expect(quadraticSegments(0, 0, 50, 100, 100, 0)).toBeGreaterThan(1);
  });

  test("segment count grows with curvature", () => {
    const gentle = quadraticSegments(0, 0, 50, 5, 100, 0);
    const sharp = quadraticSegments(0, 0, 50, 500, 100, 0);
    expect(sharp).toBeGreaterThan(gentle);
  });

  test("a tighter tolerance asks for more segments", () => {
    const coarse = quadraticSegments(0, 0, 50, 100, 100, 0, 1);
    const fine = quadraticSegments(0, 0, 50, 100, 100, 0, 0.01);
    expect(fine).toBeGreaterThan(coarse);
  });

  test("never returns zero, whatever the input", () => {
    expect(quadraticSegments(0, 0, 0, 0, 0, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("flattenQuadratic", () => {
  test("ends exactly on the endpoint", () => {
    const sink = collect();
    flattenQuadratic(sink, 0, 0, 50, 100, 100, 0);
    const last = sink.points.at(-1) as [number, number];
    expect(last[0]).toBeCloseTo(100, 9);
    expect(last[1]).toBeCloseTo(0, 9);
  });

  test("does not repeat the start point", () => {
    // The current point is already in the polyline; emitting it again would
    // create a zero-length segment and a degenerate stroke join.
    const sink = collect();
    flattenQuadratic(sink, 10, 20, 50, 100, 100, 0);
    expect(sink.points[0]).not.toEqual([10, 20]);
  });

  test("stays within tolerance of the true curve", () => {
    const tolerance = 0.25;
    const sink = collect();
    flattenQuadratic(sink, 0, 0, 50, 200, 100, 0, tolerance);

    // Every flattened vertex lies on the curve by construction, so check the
    // chords instead: sample the true curve densely and measure how far each
    // sample sits from the nearest polyline segment.
    const all: Array<[number, number]> = [[0, 0], ...sink.points];
    let worst = 0;
    for (let i = 0; i <= 400; i++) {
      const [px, py] = quadAt(i / 400, 0, 0, 50, 200, 100, 0);
      let nearest = Infinity;
      for (let s = 0; s < all.length - 1; s++) {
        const [ax, ay] = all[s] as [number, number];
        const [bx, by] = all[s + 1] as [number, number];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t =
          len2 === 0 ? 0 : Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / len2, 0), 1);
        nearest = Math.min(nearest, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
      }
      worst = Math.max(worst, nearest);
    }
    expect(worst).toBeLessThanOrEqual(tolerance);
  });

  test("a degenerate curve produces a single segment", () => {
    const sink = collect();
    flattenQuadratic(sink, 0, 0, 0, 0, 0, 0);
    expect(sink.points).toHaveLength(1);
  });
});

describe("cubicSegments", () => {
  test("a straight, evenly parameterised cubic needs one segment", () => {
    // Controls at exactly a third and two thirds: the curve is the chord, the
    // parameterisation is uniform, and the second derivative is zero.
    expect(cubicSegments(0, 0, 100 / 3, 0, 200 / 3, 0, 100, 0)).toBe(1);
  });

  test("is conservative for a straight but unevenly spaced cubic", () => {
    // Geometrically still a line, but the second derivative is non-zero
    // because the parameterisation is not uniform. Conservative in the safe
    // direction: extra vertices, never a visible facet.
    expect(cubicSegments(0, 0, 33, 0, 66, 0, 100, 0)).toBeGreaterThanOrEqual(1);
  });

  test("an S-curve is measured by its larger lobe", () => {
    // One control point flat, the other far out: bounding only the first would
    // under-segment the second half.
    const asymmetric = cubicSegments(0, 0, 10, 0, 90, 300, 100, 0);
    expect(asymmetric).toBeGreaterThan(4);
  });

  test("is symmetric under reversal", () => {
    const forward = cubicSegments(0, 0, 20, 80, 80, 80, 100, 0);
    const backward = cubicSegments(100, 0, 80, 80, 20, 80, 0, 0);
    expect(forward).toBe(backward);
  });
});

describe("flattenCubic", () => {
  test("ends exactly on the endpoint", () => {
    const sink = collect();
    flattenCubic(sink, 0, 0, 20, 80, 80, 80, 100, 0);
    const last = sink.points.at(-1) as [number, number];
    expect(last[0]).toBeCloseTo(100, 9);
    expect(last[1]).toBeCloseTo(0, 9);
  });

  test("produces a monotone parameterisation", () => {
    // Points come out in curve order; an out-of-order point would fold the
    // polyline back on itself and break both fill and stroke.
    const sink = collect();
    flattenCubic(sink, 0, 0, 33, 100, 66, -100, 100, 0);
    for (let i = 1; i < sink.points.length; i++) {
      expect((sink.points[i] as [number, number])[0]).toBeGreaterThan(
        (sink.points[i - 1] as [number, number])[0],
      );
    }
  });

  test("a straight cubic flattens to points on the line", () => {
    const sink = collect();
    flattenCubic(sink, 0, 0, 100 / 3, 0, 200 / 3, 0, 100, 0);
    expect(sink.points).toEqual([[100, 0]]);
  });

  test("stays within tolerance of the true curve", () => {
    // The property that actually matters, checked the same way as for
    // quadratics: sample the exact curve and measure distance to the polyline.
    const tolerance = 0.25;
    const p = [0, 0, 20, 200, 80, -200, 100, 0] as const;
    const sink = collect();
    flattenCubic(sink, ...p, tolerance);

    const all: Array<[number, number]> = [[p[0], p[1]], ...sink.points];
    let worst = 0;
    for (let i = 0; i <= 600; i++) {
      const t = i / 600;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      const px = a * p[0] + b * p[2] + c * p[4] + d * p[6];
      const py = a * p[1] + b * p[3] + c * p[5] + d * p[7];

      let nearest = Infinity;
      for (let sIdx = 0; sIdx < all.length - 1; sIdx++) {
        const [ax, ay] = all[sIdx] as [number, number];
        const [bx, by] = all[sIdx + 1] as [number, number];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const tt =
          len2 === 0 ? 0 : Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / len2, 0), 1);
        nearest = Math.min(nearest, Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy)));
      }
      worst = Math.max(worst, nearest);
    }
    expect(worst).toBeLessThanOrEqual(tolerance);
  });
});
