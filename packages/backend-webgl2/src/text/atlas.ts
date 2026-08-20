import { signedDistanceField } from './edt';

/**
 * A signed-distance-field glyph atlas, generated at runtime from a system font.
 *
 * SDF rather than MSDF. MSDF preserves sharp corners at very large scale, but
 * generating it needs an offline tool and a shipped atlas file; single-channel
 * SDF can be built in the browser from any font the user already has, with no
 * build step and no asset to keep in sync. The trade is that corners soften
 * once a glyph is drawn far above its atlas resolution.
 *
 * The field is stored as one byte per texel, with distance mapped into 0..255
 * around a mid-point of 128, so the shader reads `(v - 0.5) * range`.
 */

/** Where a glyph sits in the atlas, and how to place it, in em units. */
export interface Glyph {
  /** Atlas texture coordinates, 0..1. */
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  /** Quad offset from the pen position, as a fraction of font size. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Pen advance, as a fraction of font size. */
  readonly advance: number;
}

export interface AtlasOptions {
  /** Pixel size each glyph is rasterised at. Higher is crisper and larger. */
  readonly fontSize?: number;
  /** Distance range in pixels represented by the byte range. */
  readonly range?: number;
  /** Characters to include. */
  readonly charset?: string;
}

const DEFAULT_CHARSET =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~';

const DEFAULT_FONT_SIZE = 48;
const DEFAULT_RANGE = 8;

export class SdfAtlas {
  readonly family: string;
  readonly fontSize: number;
  readonly range: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  /** Ascender height as a fraction of font size, for baseline alignment. */
  readonly ascent: number;
  readonly descent: number;

  #glyphs = new Map<string, Glyph>();

  constructor(family: string, options: AtlasOptions = {}) {
    this.family = family;
    this.fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
    this.range = options.range ?? DEFAULT_RANGE;

    const charset = options.charset ?? DEFAULT_CHARSET;
    const pad = Math.ceil(this.range);
    const cell = this.fontSize + pad * 2;

    // Square-ish atlas, rounded up to whole cells.
    const columns = Math.ceil(Math.sqrt(charset.length));
    const rows = Math.ceil(charset.length / columns);
    this.width = columns * cell;
    this.height = rows * cell;
    this.data = new Uint8Array(this.width * this.height);

    const canvas = document.createElement('canvas');
    canvas.width = cell;
    canvas.height = cell;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('Canvas2D is required to build a text atlas');

    ctx.font = `${this.fontSize}px ${family}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';

    const metrics = ctx.measureText('Hg');
    this.ascent = (metrics.actualBoundingBoxAscent || this.fontSize * 0.8) / this.fontSize;
    this.descent = (metrics.actualBoundingBoxDescent || this.fontSize * 0.2) / this.fontSize;

    const baseline = pad + this.fontSize * this.ascent;

    for (const [index, char] of [...charset].entries()) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      this.#rasterize(ctx, char, cell, pad, baseline, col * cell, row * cell);
    }
  }

  glyph(char: string): Glyph | undefined {
    return this.#glyphs.get(char);
  }

  get glyphCount(): number {
    return this.#glyphs.size;
  }

  /** Width of `content` at `fontSize`, in pixels. */
  measure(content: string, fontSize: number): number {
    let total = 0;
    for (const char of content) total += this.glyph(char)?.advance ?? 0;
    return total * fontSize;
  }

  #rasterize(
    ctx: CanvasRenderingContext2D,
    char: string,
    cell: number,
    pad: number,
    baseline: number,
    atlasX: number,
    atlasY: number,
  ): void {
    ctx.clearRect(0, 0, cell, cell);
    ctx.fillText(char, pad, baseline);

    const advance = ctx.measureText(char).width / this.fontSize;
    const pixels = ctx.getImageData(0, 0, cell, cell).data;

    const alpha = new Float64Array(cell * cell);
    for (let i = 0; i < alpha.length; i++) alpha[i] = (pixels[i * 4 + 3] as number) / 255;

    const sdf = signedDistanceField(alpha, cell, cell);

    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        // Positive outside, so invert to make "more = more inside".
        const d = -(sdf[y * cell + x] as number) / this.range;
        const byte = Math.round(Math.min(Math.max(d * 0.5 + 0.5, 0), 1) * 255);
        this.data[(atlasY + y) * this.width + atlasX + x] = byte;
      }
    }

    this.#glyphs.set(char, {
      u0: atlasX / this.width,
      v0: atlasY / this.height,
      u1: (atlasX + cell) / this.width,
      v1: (atlasY + cell) / this.height,
      // The cell is padded on both sides, and the pen sits at the baseline.
      left: -pad / this.fontSize,
      top: -baseline / this.fontSize,
      width: cell / this.fontSize,
      height: cell / this.fontSize,
      advance,
    });
  }
}
