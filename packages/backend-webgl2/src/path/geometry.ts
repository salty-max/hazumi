/**
 * Turning flattened contours into triangles.
 *
 * Fills use a stencil pass rather than a triangulator. Every contour is drawn
 * as a fan from an arbitrary pivot, which covers each interior point an odd or
 * even number of times depending on winding; the stencil counts that and a
 * covering quad then paints only where the count says "inside". It handles
 * self-intersecting paths and holes with no triangulation at all, and it gets
 * the nonzero rule — which is what Canvas2D uses — rather than only even-odd.
 *
 * Strokes are expanded on the CPU into quads with round joins.
 */

/** Fan triangles for one contour, as a flat [x, y, …] vertex list. */
export function fanTriangles(contour: readonly number[], out: number[]): void {
  const count = contour.length / 2;
  if (count < 3) return;

  // Pivot is the first point; any point works, including one outside the shape.
  const px = contour[0] as number;
  const py = contour[1] as number;

  for (let i = 1; i < count - 1; i++) {
    out.push(
      px, py,
      contour[i * 2] as number, contour[i * 2 + 1] as number,
      contour[(i + 1) * 2] as number, contour[(i + 1) * 2 + 1] as number,
    );
  }
}

/** Two triangles covering a rectangle, as a flat vertex list. */
export function quadTriangles(
  minX: number, minY: number,
  maxX: number, maxY: number,
  out: number[],
): void {
  out.push(
    minX, minY, maxX, minY, maxX, maxY,
    minX, minY, maxX, maxY, minX, maxY,
  );
}

/** Segments per round join, chosen from the stroke width. */
function joinSegments(halfWidth: number): number {
  return Math.min(Math.max(Math.ceil(halfWidth), 3), 16);
}

/**
 * Expand a polyline into triangles.
 *
 * Each segment becomes a quad, and each interior vertex gets a round join. A
 * miter would be cheaper but spikes without bound at a sharp angle; a round
 * join costs a handful of triangles and never does.
 */
export function strokeTriangles(
  contour: readonly number[],
  width: number,
  out: number[],
): void {
  const half = width / 2;
  const count = contour.length / 2;
  if (count < 2 || half <= 0) return;

  const segments = joinSegments(half);

  for (let i = 0; i < count - 1; i++) {
    const ax = contour[i * 2] as number;
    const ay = contour[i * 2 + 1] as number;
    const bx = contour[(i + 1) * 2] as number;
    const by = contour[(i + 1) * 2 + 1] as number;

    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    // A zero-length segment has no direction, so it contributes nothing.
    if (len === 0) continue;

    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;

    out.push(
      ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny,
      ax + nx, ay + ny, bx - nx, by - ny, ax - nx, ay - ny,
    );
  }

  // Round joins at the interior vertices, and caps are left butt to match the
  // line primitive and Canvas2D's default.
  for (let i = 1; i < count - 1; i++) {
    const cx = contour[i * 2] as number;
    const cy = contour[i * 2 + 1] as number;
    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      out.push(
        cx, cy,
        cx + Math.cos(a0) * half, cy + Math.sin(a0) * half,
        cx + Math.cos(a1) * half, cy + Math.sin(a1) * half,
      );
    }
  }
}
