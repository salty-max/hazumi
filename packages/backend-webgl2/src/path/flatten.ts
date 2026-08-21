/**
 * Bezier flattening.
 *
 * The command buffer stores control points, so the GPU backend is the first
 * place a curve becomes a polyline — which is exactly where the invariant in
 * AGENTS.md says it should happen. Flattening here rather than in the encoder
 * is what lets SVG export real curve commands and lets the tolerance depend on
 * how large the path is actually being drawn.
 *
 * Subdivision is adaptive: a nearly-straight curve gets few segments, a tight
 * one gets many. A fixed segment count is either wasteful or visibly faceted,
 * depending on the curve.
 */

/** Maximum deviation from the true curve, in the path's own units. */
export const DEFAULT_TOLERANCE = 0.25;

/** Guard against a pathological curve subdividing without end. */
const MAX_DEPTH = 16;

/** A polyline under construction. */
export interface PolylineSink {
  push: (x: number, y: number) => void;
}

/**
 * Segment count from a bound on the second derivative.
 *
 * Approximating a curve with n uniform chords has error at most |P''| / (8n²),
 * so n = sqrt(maxSecondDerivative / (8 · tolerance)) is the count that meets a
 * given tolerance. Both curve types use this; only the bound on P'' differs.
 */
function segmentsForSecondDerivative(magnitude: number, tolerance: number): number {
  if (magnitude <= 0 || tolerance <= 0) return 1;
  const n = Math.ceil(Math.sqrt(magnitude / (8 * tolerance)));
  return Math.min(Math.max(n, 1), 1 << MAX_DEPTH);
}

/**
 * Segment count for a quadratic.
 *
 * A quadratic's second derivative is constant: 2·(P0 − 2C + P1).
 */
export function quadraticSegments(
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  tolerance: number = DEFAULT_TOLERANCE,
): number {
  const magnitude = 2 * Math.hypot(x0 - 2 * cx + x1, y0 - 2 * cy + y1);
  return segmentsForSecondDerivative(magnitude, tolerance);
}

export function flattenQuadratic(
  sink: PolylineSink,
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  tolerance: number = DEFAULT_TOLERANCE,
): void {
  const n = quadraticSegments(x0, y0, cx, cy, x1, y1, tolerance);
  // Starts at 1: the current point is already in the polyline.
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    sink.push(
      u * u * x0 + 2 * u * t * cx + t * t * x1,
      u * u * y0 + 2 * u * t * cy + t * t * y1,
    );
  }
}

/**
 * Segment count for a cubic.
 *
 * A cubic's second derivative is linear in t, so it is bounded by the larger of
 * its values at the endpoints: 6·max(|P0 − 2P1 + P2|, |P1 − 2P2 + P3|). Taking
 * the larger is what covers both lobes of an S-curve rather than only the
 * first.
 *
 * Reusing the quadratic bound here — which an earlier version did — under-
 * segments a sharp S by around a factor of two, and error grows as 1/n², so it
 * shows up as a visible facet. The tolerance test in flatten.test.ts is what
 * caught that.
 */
export function cubicSegments(
  x0: number, y0: number,
  c1x: number, c1y: number,
  c2x: number, c2y: number,
  x1: number, y1: number,
  tolerance: number = DEFAULT_TOLERANCE,
): number {
  const a = Math.hypot(x0 - 2 * c1x + c2x, y0 - 2 * c1y + c2y);
  const b = Math.hypot(c1x - 2 * c2x + x1, c1y - 2 * c2y + y1);
  return segmentsForSecondDerivative(6 * Math.max(a, b), tolerance);
}

export function flattenCubic(
  sink: PolylineSink,
  x0: number, y0: number,
  c1x: number, c1y: number,
  c2x: number, c2y: number,
  x1: number, y1: number,
  tolerance: number = DEFAULT_TOLERANCE,
): void {
  const n = cubicSegments(x0, y0, c1x, c1y, c2x, c2y, x1, y1, tolerance);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    sink.push(
      a * x0 + b * c1x + c * c2x + d * x1,
      a * y0 + b * c1y + c * c2y + d * y1,
    );
  }
}
