import { type Oklch, parse, toLinearRgb } from '@matter/color';

/** Anything the drawing API accepts as a colour. */
export type ColorLike = string | Oklch;

/** Linear-light RGBA, the form the command buffer stores. */
export type Rgba = readonly [number, number, number, number];

/**
 * Memoises colour parsing.
 *
 * `fill('#ff0000')` inside a draw loop would otherwise re-parse the string and
 * run the full OKLCH conversion for every shape, every frame. Strings in
 * sketches are overwhelmingly literals, so a plain Map hits almost always.
 */
export class ColorCache {
  #cache = new Map<string, Rgba>();
  #hits = 0;
  #misses = 0;

  get hits(): number {
    return this.#hits;
  }

  get misses(): number {
    return this.#misses;
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
    this.#cache.set(color, resolved);
    return resolved;
  }

  static #convert(color: Oklch): Rgba {
    const rgb = toLinearRgb(color);
    return [rgb.r, rgb.g, rgb.b, rgb.alpha];
  }
}
