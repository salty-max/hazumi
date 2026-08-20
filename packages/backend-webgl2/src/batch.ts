import { Blend } from '@matter/graphics';

/** A run of instances that can be drawn with one call. */
export interface Batch {
  /** First instance index. */
  readonly start: number;
  /** Number of instances. */
  readonly count: number;
  readonly blend: Blend;
}

/**
 * Groups instances into draw calls.
 *
 * Only *adjacent* instances may merge. With alpha blending the result depends
 * on the order fragments arrive, so sorting globally by pipeline key — the
 * obvious optimisation — silently reorders overlapping transparent shapes and
 * changes the image. See the performance rules in AGENTS.md.
 *
 * Opaque geometry could be sorted freely under a depth test; that is a P7
 * concern and deliberately not done here.
 */
export class BatchList {
  #batches: Batch[] = [];
  #currentBlend: Blend | null = null;
  #start = 0;
  #count = 0;

  get batches(): readonly Batch[] {
    return this.#batches;
  }

  get length(): number {
    return this.#batches.length;
  }

  reset(): void {
    this.#batches.length = 0;
    this.#currentBlend = null;
    this.#start = 0;
    this.#count = 0;
  }

  /**
   * Record one instance drawn with `blend`. Extends the open batch when the
   * pipeline matches, and starts a new one when it does not.
   */
  push(blend: Blend): void {
    if (this.#currentBlend === null) {
      this.#currentBlend = blend;
      this.#count = 1;
      return;
    }

    if (blend === this.#currentBlend) {
      this.#count++;
      return;
    }

    this.#flush();
    this.#currentBlend = blend;
    this.#count = 1;
  }

  /** Close the open batch. Call once after the last push. */
  finish(): readonly Batch[] {
    if (this.#count > 0) this.#flush();
    return this.#batches;
  }

  #flush(): void {
    this.#batches.push({
      start: this.#start,
      count: this.#count,
      blend: this.#currentBlend ?? Blend.Normal,
    });
    this.#start += this.#count;
    this.#count = 0;
  }
}
