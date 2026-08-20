import { type Oklch, parse, toLinearRgb } from '@matter/color';

/** Anything the drawing API accepts as a colour. */
export type ColorLike = string | Oklch;

/** Linear-light RGBA, the form the command buffer stores. */
export type Rgba = readonly [number, number, number, number];

/** Entries retained before the cache evicts. */
const DEFAULT_CAPACITY = 2048;

/**
 * Memoises colour parsing.
 *
 * `fill('#ff0000')` inside a draw loop would otherwise re-parse the string and
 * run the full OKLCH conversion for every shape, every frame. Strings in
 * sketches are overwhelmingly literals, so a plain Map hits almost always.
 *
 * It is bounded, because they are not *always* literals: a sketch that builds
 * a colour from a continuous value — `fill(\`oklch(0.7 0.2 ${t * 10})\`)`, an
 * entirely ordinary thing to write — produces a fresh key every frame, and an
 * unbounded map would grow for as long as the sketch runs.
 *
 * Eviction drops the oldest half in one pass rather than maintaining LRU order
 * on every read. Reordering per hit would trade a real per-shape cost against
 * a case that only arises under churn, where the evicted literals are simply
 * re-parsed once.
 */
export class ColorCache {
  #cache = new Map<string, Rgba>();
  #capacity: number;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (capacity < 2) throw new Error('ColorCache capacity must be at least 2');
    this.#capacity = capacity;
  }

  get hits(): number {
    return this.#hits;
  }

  get misses(): number {
    return this.#misses;
  }

  /** How many times the cache has shed entries. Stays 0 for literal-only sketches. */
  get evictions(): number {
    return this.#evictions;
  }

  get size(): number {
    return this.#cache.size;
  }

  resolve(color: ColorLike): Rgba {
    if (typeof color !== 'string') return ColorCache.#convert(color);

    const cached = this.#cache.get(color);
    if (cached !== undefined) {
      this.#hits++;
      return cached;
    }

    this.#misses++;
    const resolved = ColorCache.#convert(parse(color));

    if (this.#cache.size >= this.#capacity) this.#evict();
    this.#cache.set(color, resolved);
    return resolved;
  }

  /** Drop the oldest half. Map iterates in insertion order, so this is FIFO. */
  #evict(): void {
    const target = Math.floor(this.#capacity / 2);
    let removed = 0;
    for (const key of this.#cache.keys()) {
      if (removed >= target) break;
      this.#cache.delete(key);
      removed++;
    }
    this.#evictions++;
  }

  static #convert(color: Oklch): Rgba {
    const rgb = toLinearRgb(color);
    return [rgb.r, rgb.g, rgb.b, rgb.alpha];
  }
}
