import { DEFAULT_TOLERANCE, flattenCubic, flattenQuadratic } from './flatten';

/**
 * Accumulates path commands into flattened contours.
 *
 * One path may hold several contours — a letter O is two, an outer ring and an
 * inner one. They are kept separate because the fill rule depends on how they
 * wind relative to each other, which is exactly what a single merged point list
 * would destroy.
 */
export class PathBuilder {
  /**
   * Contour storage, pooled across frames.
   *
   * `#used` is how many of them this path occupies; the rest are kept for the
   * next one. Paths are rebuilt every frame, so allocating a fresh array per
   * contour per frame is exactly the per-frame allocation AGENTS.md rules out.
   */
  #pool: number[][] = [];
  #used = 0;
  #current: number[] | null = null;
  #startX = 0;
  #startY = 0;
  #x = 0;
  #y = 0;
  #tolerance: number;

  constructor(tolerance: number = DEFAULT_TOLERANCE) {
    this.#tolerance = tolerance;
  }

  /**
   * Flattened contours, each a flat [x, y, x, y, …] list.
   *
   * Allocates a view, so it is for tests and inspection. The per-frame path
   * uses `forEachContour`, which does not.
   */
  get contours(): readonly (readonly number[])[] {
    return this.#pool.slice(0, this.#used);
  }

  /** Visit each contour without allocating a view over the pool. */
  forEachContour(visit: (contour: readonly number[]) => void): void {
    for (let i = 0; i < this.#used; i++) visit(this.#pool[i] as number[]);
  }

  /** Number of contours in the current path. */
  get contourCount(): number {
    return this.#used;
  }

  get isEmpty(): boolean {
    for (let i = 0; i < this.#used; i++) {
      if ((this.#pool[i] as number[]).length >= 6) return false;
    }
    return true;
  }

  reset(): void {
    // Truncate rather than discard: the arrays are reused next frame.
    for (let i = 0; i < this.#used; i++) (this.#pool[i] as number[]).length = 0;
    this.#used = 0;
    this.#current = null;
    this.#x = 0;
    this.#y = 0;
    this.#startX = 0;
    this.#startY = 0;
  }

  moveTo(x: number, y: number): void {
    // Grows once to the deepest path a sketch ever draws, then stops.
    if (this.#used === this.#pool.length) this.#pool.push([]);
    const contour = this.#pool[this.#used] as number[];
    contour.length = 0;
    contour.push(x, y);

    this.#current = contour;
    this.#used++;
    this.#startX = x;
    this.#startY = y;
    this.#x = x;
    this.#y = y;
  }

  lineTo(x: number, y: number): void {
    // A path that starts with lineTo has an implicit origin, as in Canvas2D.
    if (this.#current === null) this.moveTo(this.#x, this.#y);
    (this.#current as number[]).push(x, y);
    this.#x = x;
    this.#y = y;
  }

  quadraticTo(cx: number, cy: number, x: number, y: number): void {
    if (this.#current === null) this.moveTo(this.#x, this.#y);
    const target = this.#current as number[];
    flattenQuadratic(
      { push: (px, py) => void target.push(px, py) },
      this.#x, this.#y, cx, cy, x, y,
      this.#tolerance,
    );
    this.#x = x;
    this.#y = y;
  }

  cubicTo(
    c1x: number, c1y: number,
    c2x: number, c2y: number,
    x: number, y: number,
  ): void {
    if (this.#current === null) this.moveTo(this.#x, this.#y);
    const target = this.#current as number[];
    flattenCubic(
      { push: (px, py) => void target.push(px, py) },
      this.#x, this.#y, c1x, c1y, c2x, c2y, x, y,
      this.#tolerance,
    );
    this.#x = x;
    this.#y = y;
  }

  close(): void {
    if (this.#current === null) return;
    // Return to the contour start, then begin a fresh contour there — matching
    // Canvas2D, where drawing after closePath continues from the start point.
    this.lineTo(this.#startX, this.#startY);
    this.#current = null;
    this.#x = this.#startX;
    this.#y = this.#startY;
  }

  /** Axis-aligned bounds, or null when the path has no points. */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;

    for (let c = 0; c < this.#used; c++) {
      const contour = this.#pool[c] as number[];
      for (let i = 0; i < contour.length; i += 2) {
        const x = contour[i] as number;
        const y = contour[i + 1] as number;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        any = true;
      }
    }

    return any ? { minX, minY, maxX, maxY } : null;
  }
}
