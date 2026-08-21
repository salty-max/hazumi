import type { PixelData } from "@matter/graphics";

/** Four 8-bit straight-alpha channels in red, green, blue, alpha order. */
export type PixelColor = readonly [number, number, number, number];
/** Mutable tuple accepted as an allocation-free result from `Pixels.get()`. */
export type MutablePixelColor = [number, number, number, number];

/** Thrown when pixel operations are requested from a vector or recording backend. */
export class PixelAccessUnavailableError extends Error {
  constructor(message = "This backend does not expose raster pixels") {
    super(message);
    this.name = "PixelAccessUnavailableError";
  }
}

/** A mutable top-down snapshot of the canvas's physical pixels. */
export class Pixels implements PixelData {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, pixelRatio: number, data?: Uint8ClampedArray) {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError("Pixel dimensions must be positive integers");
    }
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
      throw new RangeError("pixelRatio must be a finite positive number");
    }
    const length = width * height * 4;
    if (data !== undefined && data.length !== length) {
      throw new RangeError(`Pixel data has ${data.length} channels; expected ${length}`);
    }
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.data = data === undefined ? new Uint8ClampedArray(length) : data;
  }

  /** Read one physical pixel. Omit `out` for convenience or reuse a tuple in a loop. */
  get(x: number, y: number, out?: MutablePixelColor): MutablePixelColor {
    const index = this.#index(x, y);
    const target = out ?? [0, 0, 0, 0];
    target[0] = this.data[index]!;
    target[1] = this.data[index + 1]!;
    target[2] = this.data[index + 2]!;
    target[3] = this.data[index + 3]!;
    return target;
  }

  /** Replace one physical pixel; channels are clamped to 0–255. */
  set(x: number, y: number, color: PixelColor): void {
    const index = this.#index(x, y);
    this.data[index] = color[0];
    this.data[index + 1] = color[1];
    this.data[index + 2] = color[2];
    this.data[index + 3] = color[3];
  }

  #index(x: number, y: number): number {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= this.width ||
      y >= this.height
    ) {
      throw new RangeError(`Pixel (${x}, ${y}) is outside ${this.width}x${this.height}`);
    }
    return (y * this.width + x) * 4;
  }
}
