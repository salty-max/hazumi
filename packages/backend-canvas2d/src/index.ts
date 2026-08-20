import {
  Blend,
  type CommandBuffer,
  type CommandVisitor,
  decode,
} from '@matter/graphics';

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
}

interface Style {
  fill: readonly [number, number, number, number];
  stroke: readonly [number, number, number, number];
  strokeWidth: number;
  blend: Blend;
}

function channel(v: number): number {
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}

/** Linear-light components to a CSS colour, matching the GPU path's input. */
function toCss(c: readonly [number, number, number, number]): string {
  return `rgba(${channel(c[0])}, ${channel(c[1])}, ${channel(c[2])}, ${c[3]})`;
}

export class Canvas2dRenderer {
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #style: Style;
  #styleStack: Style[] = [];
  #visitor: CommandVisitor;
  #drawCalls = 0;

  constructor(canvas: HTMLCanvasElement, options: Canvas2dOptions = {}) {
    const ctx = canvas.getContext('2d', { alpha: options.alpha ?? true });
    if (ctx === null) throw new Error('Canvas2D is not available on this canvas');

    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#style = Canvas2dRenderer.#defaultStyle();

    // Butt caps so a line is exactly the rectangle the GPU path draws for it.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    this.#visitor = this.#makeVisitor();
  }

  static #defaultStyle(): Style {
    return {
      fill: [0, 0, 0, 1],
      stroke: [0, 0, 0, 1],
      strokeWidth: 0,
      blend: Blend.Normal,
    };
  }

  get drawCalls(): number {
    return this.#drawCalls;
  }

  render(buffer: CommandBuffer): void {
    const ctx = this.#ctx;
    this.#drawCalls = 0;
    this.#styleStack.length = 0;
    this.#style = Canvas2dRenderer.#defaultStyle();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();

    decode(buffer, this.#visitor);

    ctx.restore();
  }

  #applyBlend(): void {
    this.#ctx.globalCompositeOperation =
      this.#style.blend === Blend.Add ? 'lighter' : 'source-over';
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
      setStroke: (r: number, g: number, b: number, a: number): void => {
        this.#style = { ...this.#style, stroke: [r, g, b, a] };
      },
      setStrokeWidth: (width: number): void => {
        this.#style = { ...this.#style, strokeWidth: width };
      },
      setBlend: (mode: Blend): void => {
        this.#style = { ...this.#style, blend: mode };
      },

      // push/pop save style and transform together, like p5's push().
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

      circle: (x: number, y: number, radius: number): void => {
        this.#paint(() => {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        });
      },

      rect: (x: number, y: number, width: number, height: number): void => {
        this.#paint(() => {
          ctx.beginPath();
          ctx.rect(x, y, width, height);
        });
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
