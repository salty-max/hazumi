import { Blend } from '@matter/graphics';

/**
 * Which program a batch draws with.
 *
 * Shapes, glyphs and images cannot share a draw call: glyphs sample a distance
 * atlas, images sample RGBA, and shapes evaluate an analytic distance. Adding
 * text is what turned the pipeline key from "blend mode" into a tuple; images
 * then joined it.
 *
 * Glyphs and images share an instance array — the layouts match — so their
 * batch starts advance together.
 */
export const Pipeline = {
  Shape: 0,
  Glyph: 1,
  Image: 2,
  /**
   * A filled path. Its vertex range is the stencil fan followed by six cover
   * vertices — the renderer draws the fan into the stencil buffer, then the
   * cover quad through it.
   */
  PathFill: 3,
  /** A stroked path: plain triangles, no stencil. */
  PathStroke: 4,
} as const;

export type Pipeline = (typeof Pipeline)[keyof typeof Pipeline];

/** A run of instances that can be drawn with one call. */
export interface Batch {
  /** First instance index, within that pipeline's own instance array. */
  readonly start: number;
  /** Number of instances. */
  readonly count: number;
  readonly blend: Blend;
  readonly pipeline: Pipeline;
  /**
   * Texture bound for this batch, or -1 when it needs none.
   *
   * Part of the key, not just cargo: two fonts in one frame use two atlases,
   * and merging across them would draw the first font's glyphs with the
   * second font's texture.
   */
  readonly texture: number;
  /**
   * For a path fill: how many of the batch's vertices are the stencil fan.
   * The rest are the cover quad. Zero for every other pipeline.
   */
  readonly fanCount: number;
}

/**
 * Groups instances into draw calls.
 *
 * Only *adjacent* instances may merge. With alpha blending the result depends
 * on the order fragments arrive, so sorting globally by pipeline key — the
 * obvious optimisation — silently reorders overlapping transparent shapes and
 * changes the image. See the performance rules in AGENTS.md.
 *
 * Opaque geometry could be sorted freely under a depth test; that is a later
 * concern and deliberately not done here.
 */
export class BatchList {
  #batches: Batch[] = [];
  #blend: Blend | null = null;
  #pipeline: Pipeline | null = null;
  #texture = -1;
  #count = 0;
  // Each pipeline indexes its own instance array, so starts advance separately.
  #starts: Record<Pipeline, number> = {
    [Pipeline.Shape]: 0,
    // Glyphs and images write into the same array, so they share a cursor.
    [Pipeline.Glyph]: 0,
    [Pipeline.Image]: 0,
    // Path fills and strokes share a vertex array too.
    [Pipeline.PathFill]: 0,
    [Pipeline.PathStroke]: 0,
  };

  get batches(): readonly Batch[] {
    return this.#batches;
  }

  get length(): number {
    return this.#batches.length;
  }

  reset(): void {
    this.#batches.length = 0;
    this.#blend = null;
    this.#pipeline = null;
    this.#texture = -1;
    this.#count = 0;
    this.#starts[Pipeline.Shape] = 0;
    this.#starts[Pipeline.Glyph] = 0;
    this.#starts[Pipeline.Image] = 0;
    this.#starts[Pipeline.PathFill] = 0;
    this.#starts[Pipeline.PathStroke] = 0;
  }

  /**
   * Record one instance. Extends the open batch when both the pipeline and the
   * blend mode match, and starts a new one when either differs.
   */
  push(blend: Blend, pipeline: Pipeline = Pipeline.Shape, texture = -1): void {
    if (this.#pipeline === null) {
      this.#blend = blend;
      this.#pipeline = pipeline;
      this.#texture = texture;
      this.#count = 1;
      return;
    }

    if (blend === this.#blend && pipeline === this.#pipeline && texture === this.#texture) {
      this.#count++;
      return;
    }

    this.#flush();
    this.#blend = blend;
    this.#pipeline = pipeline;
    this.#texture = texture;
    this.#count = 1;
  }

  /**
   * Emit a batch that never merges with its neighbours.
   *
   * A path fill runs its own stencil pass, so merging two of them would let
   * one path's winding count decide the other's interior. Strokes could merge
   * in principle, but they are already one draw per path and keeping both on
   * the same rule is simpler than a special case that saves nothing.
   */
  pushSolo(blend: Blend, pipeline: Pipeline, count: number, fanCount = 0): void {
    if (count <= 0) return;
    if (this.#count > 0) this.#flush();

    const cursor = cursorFor(pipeline);
    const start = this.#starts[cursor];
    this.#batches.push({ start, count, blend, pipeline, texture: -1, fanCount });
    this.#starts[cursor] = start + count;

    // Nothing is open afterwards, so the next push starts fresh.
    this.#blend = null;
    this.#pipeline = null;
    this.#texture = -1;
    this.#count = 0;
  }

  /** Close the open batch. Call once after the last push. */
  finish(): readonly Batch[] {
    if (this.#count > 0) this.#flush();
    return this.#batches;
  }

  #flush(): void {
    const pipeline = this.#pipeline ?? Pipeline.Shape;
    const cursor = cursorFor(pipeline);
    const start = this.#starts[cursor];
    this.#batches.push({
      start,
      count: this.#count,
      blend: this.#blend ?? Blend.Normal,
      pipeline,
      texture: this.#texture,
      fanCount: 0,
    });
    this.#starts[cursor] = start + this.#count;
    this.#count = 0;
  }
}

/**
 * Which vertex array a pipeline indexes.
 *
 * Three arrays, five pipelines: glyphs and images share one because their
 * instance layouts match, path fills and strokes share another, and shapes
 * have their own.
 */
function cursorFor(pipeline: Pipeline): Pipeline {
  if (pipeline === Pipeline.Shape) return Pipeline.Shape;
  if (pipeline === Pipeline.PathFill || pipeline === Pipeline.PathStroke) {
    return Pipeline.PathFill;
  }
  return Pipeline.Glyph;
}
