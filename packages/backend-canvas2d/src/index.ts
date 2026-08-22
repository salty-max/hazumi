import { toByte } from "@hazumi/color";
import {
  Align,
  Baseline,
  Blend,
  type CommandBuffer,
  type CommandVisitor,
  type PixelData,
  decode,
} from "@hazumi/graphics";

/**
 * L4 — Canvas2D. Deliberately NOT the primary path.
 *
 * Two jobs: the golden-image oracle that verifies WebGL2 correctness, and the
 * text fallback for scripts MSDF cannot handle. As a near-direct replay of the
 * command buffer it stays cheap to maintain, which is what makes it credible
 * as a reference.
 *
 * Where it and the GPU backend must agree exactly, this file is the spec:
 * butt line caps, non-scaling stroke width under uniform transforms, and
 * fill-then-stroke ordering.
 */

export interface Canvas2dOptions {
  readonly alpha?: boolean;
  /**
   * Hint that the canvas will be read back with getImageData every frame.
   *
   * Context attributes are only honoured on the *first* getContext call for a
   * canvas, so a caller that reads back cannot opt in afterwards — it has to be
   * requested here. Off by default: it keeps the surface in software, which is
   * the wrong trade for a canvas that is only displayed.
   */
  readonly willReadFrequently?: boolean;
}

interface Style {
  fill: readonly [number, number, number, number];
  stroke: readonly [number, number, number, number];
  tint: readonly [number, number, number, number];
  strokeWidth: number;
  blend: Blend;
  fontFamily: string;
  textSize: number;
  align: Align;
  baseline: Baseline;
}

const ALIGN_TO_CSS: Readonly<Record<Align, CanvasTextAlign>> = {
  [Align.Left]: "left",
  [Align.Center]: "center",
  [Align.Right]: "right",
};

const BASELINE_TO_CSS: Readonly<Record<Baseline, CanvasTextBaseline>> = {
  [Baseline.Alphabetic]: "alphabetic",
  [Baseline.Top]: "top",
  [Baseline.Middle]: "middle",
  [Baseline.Bottom]: "bottom",
};

/** Linear-light components to a CSS colour, matching the GPU path's input. */
function toCss(c: readonly [number, number, number, number]): string {
  return `rgba(${toByte(c[0])}, ${toByte(c[1])}, ${toByte(c[2])}, ${c[3]})`;
}

export class Canvas2dRenderer {
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #style: Style;
  #styleStack: Style[] = [];
  #visitor: CommandVisitor;
  #drawCalls = 0;
  #viewport: { width: number; height: number };
  /** Grow-only scratch for non-identity tints. Recreated only when a draw is larger. */
  #tintScratch: HTMLCanvasElement | null = null;
  #tintInk: CanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement, options: Canvas2dOptions = {}) {
    const ctx = canvas.getContext("2d", {
      alpha: options.alpha ?? true,
      willReadFrequently: options.willReadFrequently ?? false,
    });
    if (ctx === null) throw new Error("Canvas2D is not available on this canvas");

    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#style = Canvas2dRenderer.#defaultStyle();
    this.#viewport = { width: canvas.width, height: canvas.height };

    // Butt caps so a line is exactly the rectangle the GPU path draws for it.
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    this.#visitor = this.#makeVisitor();
  }

  static #defaultStyle(): Style {
    return {
      fill: [0, 0, 0, 1],
      stroke: [0, 0, 0, 1],
      tint: [1, 1, 1, 1],
      strokeWidth: 0,
      blend: Blend.Normal,
      fontFamily: "sans-serif",
      textSize: 16,
      align: Align.Left,
      baseline: Baseline.Alphabetic,
    };
  }

  get drawCalls(): number {
    return this.#drawCalls;
  }

  /**
   * Present for interface parity with the GPU backend. Canvas2D reads the
   * canvas dimensions directly on every frame, so there is no projection to
   * update — but a backend that silently ignored a resize would be a trap, so
   * the dimensions are recorded and asserted against in tests.
   */
  setViewport(width: number, height: number): void {
    this.#viewport = { width, height };
  }

  get viewport(): { width: number; height: number } {
    return this.#viewport;
  }

  readPixels(): PixelData {
    const image = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
    return {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
    };
  }

  writePixels(pixels: PixelData): void {
    if (pixels.width !== this.#canvas.width || pixels.height !== this.#canvas.height) {
      throw new RangeError(
        `Pixel surface is ${pixels.width}x${pixels.height}; expected ` +
          `${this.#canvas.width}x${this.#canvas.height}`,
      );
    }
    const image = this.#ctx.createImageData(pixels.width, pixels.height);
    image.data.set(pixels.data);
    this.#ctx.putImageData(image, 0, 0);
  }

  dispose(): void {
    this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    this.#tintScratch = null;
    this.#tintInk = null;
  }

  render(buffer: CommandBuffer): void {
    const ctx = this.#ctx;
    this.#drawCalls = 0;
    this.#styleStack.length = 0;
    this.#style = Canvas2dRenderer.#defaultStyle();

    this.#resetTransform();
    ctx.globalCompositeOperation = "source-over";
    // Deliberately no clearRect: a scene that never calls background()
    // accumulates across frames, matching the GPU backend.
    ctx.save();

    decode(buffer, this.#visitor);

    ctx.restore();
  }

  #resetTransform(): void {
    const scaleX = this.#viewport.width === 0 ? 1 : this.#canvas.width / this.#viewport.width;
    const scaleY = this.#viewport.height === 0 ? 1 : this.#canvas.height / this.#viewport.height;
    this.#ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }

  #applyBlend(): void {
    this.#ctx.globalCompositeOperation =
      this.#style.blend === Blend.Add ? "lighter" : "source-over";
  }

  #drawTintedImage(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): void {
    const ctx = this.#ctx;
    const tint = this.#style.tint;
    const tr = tint[0] ?? 1;
    const tg = tint[1] ?? 1;
    const tb = tint[2] ?? 1;
    const ta = tint[3] ?? 1;
    this.#applyBlend();
    if (tr === 1 && tg === 1 && tb === 1) {
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = previousAlpha * ta;
      ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.globalAlpha = previousAlpha;
      this.#drawCalls++;
      return;
    }
    const width = Math.max(1, Math.round(dw));
    const height = Math.max(1, Math.round(dh));
    const ink = this.#ensureTintScratch(width, height);
    if (ink === null) return;
    const scratch = this.#tintScratch;
    if (scratch === null) return;
    ink.globalCompositeOperation = "source-over";
    ink.clearRect(0, 0, width, height);
    ink.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
    ink.globalCompositeOperation = "multiply";
    ink.fillStyle = toCss([tr, tg, tb, 1]);
    ink.fillRect(0, 0, width, height);
    ink.globalCompositeOperation = "destination-in";
    ink.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * ta;
    ctx.drawImage(scratch, 0, 0, width, height, dx, dy, dw, dh);
    ctx.globalAlpha = previousAlpha;
    this.#drawCalls++;
  }

  #ensureTintScratch(width: number, height: number): CanvasRenderingContext2D | null {
    let scratch = this.#tintScratch;
    let ink = this.#tintInk;
    if (scratch === null || ink === null || scratch.width < width || scratch.height < height) {
      scratch = document.createElement("canvas");
      scratch.width = Math.max(width, this.#tintScratch?.width ?? 0);
      scratch.height = Math.max(height, this.#tintScratch?.height ?? 0);
      ink = scratch.getContext("2d");
      if (ink === null) return null;
      this.#tintScratch = scratch;
      this.#tintInk = ink;
    }
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.globalAlpha = 1;
    ink.globalCompositeOperation = "source-over";
    return ink;
  }

  /** Fill then stroke, matching the order the GPU backend emits instances in. */
  #paint(path: () => void): void {
    const ctx = this.#ctx;
    const style = this.#style;
    this.#applyBlend();

    if (style.fill[3] > 0) {
      ctx.fillStyle = toCss(style.fill);
      path();
      ctx.fill();
      this.#drawCalls++;
    }

    if (style.strokeWidth > 0 && style.stroke[3] > 0) {
      ctx.strokeStyle = toCss(style.stroke);
      ctx.lineWidth = style.strokeWidth;
      path();
      ctx.stroke();
      this.#drawCalls++;
    }
  }

  #makeVisitor(): CommandVisitor {
    const ctx = this.#ctx;

    return {
      setFill: (r: number, g: number, b: number, a: number): void => {
        this.#style = { ...this.#style, fill: [r, g, b, a] };
      },
      setTint: (r: number, g: number, b: number, a: number): void => {
        this.#style = { ...this.#style, tint: [r, g, b, a] };
      },
      setStroke: (r: number, g: number, b: number, a: number): void => {
        this.#style = { ...this.#style, stroke: [r, g, b, a] };
      },
      setStrokeWidth: (width: number): void => {
        this.#style = { ...this.#style, strokeWidth: width };
      },
      setBlend: (mode: Blend): void => {
        this.#style = { ...this.#style, blend: mode };
      },

      // push/pop save style and transform together, so one call restores both.
      push: (): void => {
        this.#styleStack.push(this.#style);
        ctx.save();
      },
      pop: (): void => {
        const restored = this.#styleStack.pop();
        if (restored !== undefined) this.#style = restored;
        ctx.restore();
      },

      translate: (x: number, y: number): void => void ctx.translate(x, y),
      rotate: (radians: number): void => void ctx.rotate(radians),
      scale: (x: number, y: number): void => void ctx.scale(x, y),
      resetTransform: (): void => this.#resetTransform(),

      background: (r: number, g: number, b: number, a: number): void => {
        // Painted under identity transform, ignoring whatever the scene has
        // pushed. Opaque replaces outright; translucent blends over the
        // previous frame, which is the trail idiom.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = a >= 1 ? "copy" : "source-over";
        ctx.fillStyle = toCss([r, g, b, a]);
        ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
        ctx.restore();
        this.#drawCalls++;
      },

      circle: (x: number, y: number, radius: number): void => {
        this.#paint(() => {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        });
      },

      ellipse: (x: number, y: number, rx: number, ry: number): void => {
        this.#paint(() => {
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        });
      },

      rect: (x: number, y: number, width: number, height: number): void => {
        this.#paint(() => {
          ctx.beginPath();
          ctx.rect(x, y, width, height);
        });
      },

      setTextSize: (size: number): void => {
        this.#style = { ...this.#style, textSize: size };
      },
      setTextAlign: (horizontal: Align, vertical: Baseline): void => {
        this.#style = { ...this.#style, align: horizontal, baseline: vertical };
      },
      setFont: (family: string): void => {
        this.#style = { ...this.#style, fontFamily: family };
      },
      text: (x: number, y: number, content: string): void => {
        const style = this.#style;
        if (style.fill[3] <= 0) return;
        this.#applyBlend();
        // Native text, not SDF. This backend is the reference for shapes; for
        // text the two paths rasterise differently by construction and are not
        // expected to match pixel for pixel.
        ctx.font = `${style.textSize}px ${style.fontFamily}`;
        ctx.textAlign = ALIGN_TO_CSS[style.align];
        ctx.textBaseline = BASELINE_TO_CSS[style.baseline];
        ctx.fillStyle = toCss(style.fill);
        ctx.fillText(content, x, y);
        this.#drawCalls++;
      },

      // Paths map straight onto the native API — curves stay curves, so this
      // backend never sees a flattened polyline.
      beginPath: (): void => ctx.beginPath(),
      moveTo: (x: number, y: number): void => ctx.moveTo(x, y),
      lineTo: (x: number, y: number): void => ctx.lineTo(x, y),
      quadraticTo: (cx: number, cy: number, x: number, y: number): void =>
        ctx.quadraticCurveTo(cx, cy, x, y),
      cubicTo: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void =>
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y),
      closePath: (): void => ctx.closePath(),
      fillPath: (): void => {
        const style = this.#style;
        if (style.fill[3] <= 0) return;
        this.#applyBlend();
        ctx.fillStyle = toCss(style.fill);
        // Nonzero, the CSS default, and what the GPU backend's stencil
        // configuration reproduces.
        ctx.fill("nonzero");
        this.#drawCalls++;
      },
      strokePath: (): void => {
        const style = this.#style;
        if (style.strokeWidth <= 0 || style.stroke[3] <= 0) return;
        this.#applyBlend();
        ctx.strokeStyle = toCss(style.stroke);
        ctx.lineWidth = style.strokeWidth;
        ctx.stroke();
        this.#drawCalls++;
      },

      image: (source, x: number, y: number, width: number, height: number): void => {
        this.#drawTintedImage(source, x, y, width, height, 0, 0, source.width, source.height);
      },
      imageRegion: (source, dx, dy, dw, dh, sx, sy, sw, sh): void => {
        this.#drawTintedImage(source, dx, dy, dw, dh, sx, sy, sw, sh);
      },

      line: (x1: number, y1: number, x2: number, y2: number): void => {
        // A line has no fill; it is stroke-only in both backends.
        const style = this.#style;
        if (style.strokeWidth <= 0 || style.stroke[3] <= 0) return;
        this.#applyBlend();
        ctx.strokeStyle = toCss(style.stroke);
        ctx.lineWidth = style.strokeWidth;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        this.#drawCalls++;
      },
    };
  }
}

import type { BackendFactory } from "@hazumi/graphics";

/** Backend factory for `start({ backend: canvas2d() }, scene)`. */
export function canvas2d(options: Canvas2dOptions = {}): BackendFactory {
  return (canvas: HTMLCanvasElement) => new Canvas2dRenderer(canvas, options);
}
