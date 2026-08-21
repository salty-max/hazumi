import { type Oklch, parse, toSrgb } from '@matter/color';

/** Anything the drawing API accepts as a colour. */
export type ColorLike = string | Oklch;

/**
 * Display-referred sRGB RGBA, 0-1 — the form the command buffer stores.
 *
 * sRGB rather than linear-light on purpose. Every backend composites in the
 * space it is handed: Canvas2D blends in sRGB, SVG colours are sRGB, and the
 * GPU path writes to a non-sRGB framebuffer. Storing linear values would mean
 * each backend displaying them uncorrected — mid-grey #808080 would render as
 * rgb(55, 55, 55).
 *
 * Physically correct linear-space blending needs an sRGB framebuffer and a
 * matching change in Canvas2D, which cannot follow. Matching what the web does
 * is the right trade here.
 */
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
 * a colour from a continuous value — a template literal interpolating time,
 * say — an
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
    // toSrgb gamut-maps by reducing chroma, so an out-of-gamut OKLCH value
    // keeps its hue instead of clipping toward a different one.
    const rgb = toSrgb(color);
    return [rgb.r, rgb.g, rgb.b, rgb.alpha];
  }
}
