import { toByte } from "@hazumi/color";
import {
  type Affine,
  Align,
  Baseline,
  Blend,
  type CommandBuffer,
  type CommandVisitor,
  copyAffine,
  decode,
  identityAffine,
  resetAffine,
  rotateAffine,
  scaleAffine,
  translateAffine,
  type TextMetrics,
} from "@hazumi/graphics";

/**
 * L4 — vector export.
 *
 * This backend is also the abstraction test. It can only exist because the
 * command buffer stores high-level primitives: a circle is still a circle here,
 * not a fan of triangles. If tessellation ever leaks into the encoder, this is
 * where it fails loudly, while the GPU backend carries on looking fine.
 *
 * Transforms are baked into each element rather than emitted as nested <g>
 * elements. The stream's push/pop nesting does not always correspond to
 * document nesting — a pop can cross a background, for instance — and a flat
 * document with explicit matrices is both simpler and unambiguous.
 */

export interface SvgOptions {
  /** Decimal places kept in the output. */
  readonly precision?: number;
  /** Emit newlines between elements. */
  readonly pretty?: boolean;
}

const DEFAULT_PRECISION = 3;

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

const ALIGN_TO_SVG: Readonly<Record<Align, string>> = {
  [Align.Left]: "start",
  [Align.Center]: "middle",
  [Align.Right]: "end",
};

const BASELINE_TO_SVG: Readonly<Record<Baseline, string>> = {
  [Baseline.Alphabetic]: "alphabetic",
  [Baseline.Top]: "hanging",
  [Baseline.Middle]: "middle",
  [Baseline.Bottom]: "text-after-edge",
};

function defaultStyle(): Style {
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

function hexByte(v: number): string {
  return toByte(v).toString(16).padStart(2, "0");
}

function toHex(c: readonly [number, number, number, number]): string {
  return `#${hexByte(c[0])}${hexByte(c[1])}${hexByte(c[2])}`;
}

/** SVG is XML, so anything interpolated into it has to be escaped. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class SvgRenderer {
  #width: number;
  #height: number;
  #precision: number;
  #pretty: boolean;

  #elements: string[] = [];
  #filters: string[] = [];
  /** Reused across images that share a tint, so a raycaster does not emit 600 filters. */
  #tintFilters = new Map<string, string>();
  /** Segments of the path under construction, as SVG `d` commands. */
  #path: string[] = [];
  #style: Style = defaultStyle();
  #styleStack: Style[] = [];
  #xform: Affine = identityAffine();
  #xformStack: Affine[] = [];
  #visitor: CommandVisitor;

  constructor(width: number, height: number, options: SvgOptions = {}) {
    this.#width = width;
    this.#height = height;
    this.#precision = options.precision ?? DEFAULT_PRECISION;
    this.#pretty = options.pretty ?? true;
    this.#visitor = this.#makeVisitor();
  }

  /** The document produced by the last render. */
  get svg(): string {
    const separator = this.#pretty ? "\n  " : "";
    const tail = this.#pretty ? "\n" : "";
    const defs = this.#filters.length === 0 ? [] : [`<defs>${this.#filters.join("")}</defs>`];
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.#width}" height="${this.#height}" viewBox="0 0 ${this.#width} ${this.#height}">`,
      ...defs,
      ...this.#elements,
      `</svg>`,
    ]
      .join(separator === "" ? "" : separator)
      .replace("</svg>", `${tail}</svg>`);
  }

  /**
   * Measure through an offscreen 2D context.
   *
   * Exported SVG uses native `<text>`, so there is no atlas to sum here — but a
   * scene that wraps text still calls this while rendering to SVG, and leaving
   * it unimplemented would break layout for the duration of an export. Same
   * "Hg" convention as the other backends so the numbers agree.
   */
  measureText(content: string, font: string, size: number): TextMetrics {
    const ctx = SvgRenderer.#measureContext();
    if (ctx === null) return { width: 0, ascent: 0, descent: 0, lineHeight: size };

    ctx.font = `${size}px ${font}`;
    const run = ctx.measureText(content);
    const sample = ctx.measureText("Hg");
    const box = (sample.fontBoundingBoxAscent ?? 0) + (sample.fontBoundingBoxDescent ?? 0);
    return {
      width: run.width,
      ascent: sample.actualBoundingBoxAscent || size * 0.8,
      descent: sample.actualBoundingBoxDescent || size * 0.2,
      lineHeight: box > 0 ? box : size * 1.2,
    };
  }

  /** One 1x1 canvas for every measurement, rather than one per call. */
  static #measure: CanvasRenderingContext2D | null = null;
  static #measureContext(): CanvasRenderingContext2D | null {
    if (SvgRenderer.#measure === null) {
      SvgRenderer.#measure = document.createElement("canvas").getContext("2d");
    }
    return SvgRenderer.#measure;
  }

  setViewport(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
  }

  dispose(): void {
    this.#elements.length = 0;
  }

  render(buffer: CommandBuffer): void {
    this.#elements.length = 0;
    this.#filters.length = 0;
    this.#tintFilters.clear();
    this.#style = defaultStyle();
    this.#styleStack.length = 0;
    this.#xform = identityAffine();
    this.#xformStack.length = 0;
    this.#path.length = 0;

    decode(buffer, this.#visitor);
  }

  #n(value: number): string {
    // Trim trailing zeros: 10.000 is noise in a vector file.
    return Number.parseFloat(value.toFixed(this.#precision)).toString();
  }

  #imagePaint(): string {
    const tint = this.#style.tint;
    const r = tint[0] ?? 1;
    const g = tint[1] ?? 1;
    const b = tint[2] ?? 1;
    const a = tint[3] ?? 1;
    let extra = this.#transformAttr();
    if (a !== 1) extra += ` opacity="${this.#n(a)}"`;
    if (r !== 1 || g !== 1 || b !== 1) {
      const key = `${this.#n(r)} ${this.#n(g)} ${this.#n(b)}`;
      let id = this.#tintFilters.get(key);
      if (id === undefined) {
        id = `hazumi-tint-${this.#filters.length}`;
        this.#tintFilters.set(key, id);
        this.#filters.push(
          `<filter id="${id}"><feColorMatrix type="matrix" values="${this.#n(r)} 0 0 0 0 0 ${this.#n(g)} 0 0 0 0 0 ${this.#n(b)} 0 0 0 0 0 1 0"/></filter>`,
        );
      }
      extra += ` filter="url(#${id})"`;
    }
    return extra;
  }

  /** Baked transform, omitted entirely when it is the identity. */
  #transformAttr(): string {
    const m = this.#xform;
    if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.tx === 0 && m.ty === 0) {
      return "";
    }
    return ` transform="matrix(${this.#n(m.a)} ${this.#n(m.b)} ${this.#n(m.c)} ${this.#n(m.d)} ${this.#n(m.tx)} ${this.#n(m.ty)})"`;
  }

  #paintAttrs(mode: "both" | "fill" | "stroke" = "both"): string {
    const s = this.#style;
    const parts: string[] = [];

    if (mode === "stroke" || s.fill[3] <= 0) parts.push('fill="none"');
    else {
      parts.push(`fill="${toHex(s.fill)}"`);
      if (s.fill[3] < 1) parts.push(`fill-opacity="${this.#n(s.fill[3])}"`);
    }

    if (mode !== "fill" && s.strokeWidth > 0 && s.stroke[3] > 0) {
      parts.push(`stroke="${toHex(s.stroke)}"`);
      parts.push(`stroke-width="${this.#n(s.strokeWidth)}"`);
      if (s.stroke[3] < 1) parts.push(`stroke-opacity="${this.#n(s.stroke[3])}"`);
    }

    // Additive blending has a direct CSS equivalent; normal is the default.
    if (s.blend === Blend.Add) parts.push('style="mix-blend-mode:plus-lighter"');

    return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
  }

  /**
   * Emit the accumulated path.
   *
   * Fill and stroke are separate elements rather than one with both attributes,
   * because a scene may fill and stroke the same path with different styles
   * set between the two calls.
   */
  #emitPath(strokeOnly: boolean): void {
    if (this.#path.length === 0) return;
    const s = this.#style;
    if (strokeOnly && (s.strokeWidth <= 0 || s.stroke[3] <= 0)) return;
    if (!strokeOnly && s.fill[3] <= 0) return;

    this.#elements.push(
      `<path d="${this.#path.join(" ")}"${this.#paintAttrs(strokeOnly ? "stroke" : "fill")}${this.#transformAttr()}/>`,
    );
  }

  #makeVisitor(): CommandVisitor {
    return {
      setFill: (r, g, b, a): void => {
        this.#style = { ...this.#style, fill: [r, g, b, a] };
      },
      setTint: (r, g, b, a): void => {
        this.#style = { ...this.#style, tint: [r, g, b, a] };
      },
      setStroke: (r, g, b, a): void => {
        this.#style = { ...this.#style, stroke: [r, g, b, a] };
      },
      setStrokeWidth: (width): void => {
        this.#style = { ...this.#style, strokeWidth: width };
      },
      setBlend: (mode): void => {
        this.#style = { ...this.#style, blend: mode };
      },

      push: (): void => {
        this.#styleStack.push(this.#style);
        const saved = identityAffine();
        copyAffine(saved, this.#xform);
        this.#xformStack.push(saved);
      },
      pop: (): void => {
        const style = this.#styleStack.pop();
        if (style !== undefined) this.#style = style;
        const xform = this.#xformStack.pop();
        if (xform !== undefined) this.#xform = xform;
      },

      translate: (x, y): void => translateAffine(this.#xform, x, y),
      rotate: (radians): void => rotateAffine(this.#xform, radians),
      scale: (x, y): void => scaleAffine(this.#xform, x, y),
      resetTransform: (): void => resetAffine(this.#xform),

      background: (r, g, b, a): void => {
        if (a >= 1) {
          // Opaque: everything before it is hidden, so drop it.
          this.#elements.length = 0;
        }
        this.#elements.push(
          `<rect x="0" y="0" width="${this.#width}" height="${this.#height}" fill="${toHex([r, g, b, a])}"${a < 1 ? ` fill-opacity="${this.#n(a)}"` : ""}/>`,
        );
      },

      circle: (x, y, radius): void => {
        this.#elements.push(
          `<circle cx="${this.#n(x)}" cy="${this.#n(y)}" r="${this.#n(radius)}"${this.#paintAttrs()}${this.#transformAttr()}/>`,
        );
      },

      ellipse: (x, y, rx, ry): void => {
        this.#elements.push(
          `<ellipse cx="${this.#n(x)}" cy="${this.#n(y)}" rx="${this.#n(rx)}" ry="${this.#n(ry)}"${this.#paintAttrs()}${this.#transformAttr()}/>`,
        );
      },

      rect: (x, y, width, height): void => {
        this.#elements.push(
          `<rect x="${this.#n(x)}" y="${this.#n(y)}" width="${this.#n(width)}" height="${this.#n(height)}"${this.#paintAttrs()}${this.#transformAttr()}/>`,
        );
      },

      setTextSize: (size): void => {
        this.#style = { ...this.#style, textSize: size };
      },
      setTextAlign: (horizontal, vertical): void => {
        this.#style = { ...this.#style, align: horizontal, baseline: vertical };
      },
      setFont: (family): void => {
        this.#style = { ...this.#style, fontFamily: family };
      },
      text: (x, y, content): void => {
        const s = this.#style;
        if (s.fill[3] <= 0) return;
        // Real <text>, so the export stays editable and the glyphs stay
        // selectable — the reason to export vector in the first place.
        this.#elements.push(
          `<text x="${this.#n(x)}" y="${this.#n(y)}" font-family="${escapeXml(s.fontFamily)}" font-size="${this.#n(s.textSize)}" text-anchor="${ALIGN_TO_SVG[s.align]}" dominant-baseline="${BASELINE_TO_SVG[s.baseline]}" fill="${toHex(s.fill)}"${s.fill[3] < 1 ? ` fill-opacity="${this.#n(s.fill[3])}"` : ""}${this.#transformAttr()}>${escapeXml(content)}</text>`,
        );
      },

      // The whole reason this backend exists: curves arrive as curves and
      // leave as curve commands. A polyline here would mean flattening had
      // leaked into the encoder.
      beginPath: (): void => {
        this.#path.length = 0;
      },
      moveTo: (x, y): void => void this.#path.push(`M${this.#n(x)} ${this.#n(y)}`),
      lineTo: (x, y): void => void this.#path.push(`L${this.#n(x)} ${this.#n(y)}`),
      quadraticTo: (cx, cy, x, y): void =>
        void this.#path.push(`Q${this.#n(cx)} ${this.#n(cy)} ${this.#n(x)} ${this.#n(y)}`),
      cubicTo: (c1x, c1y, c2x, c2y, x, y): void =>
        void this.#path.push(
          `C${this.#n(c1x)} ${this.#n(c1y)} ${this.#n(c2x)} ${this.#n(c2y)} ${this.#n(x)} ${this.#n(y)}`,
        ),
      closePath: (): void => void this.#path.push("Z"),
      fillPath: (): void => this.#emitPath(false),
      strokePath: (): void => this.#emitPath(true),

      imageRegion: (source, dx, dy, dw, dh, sx, sy, sw, sh): void => {
        // Crop into a canvas first: SVG can clip, but a clipPath per sprite
        // would bloat the document and defeat the point of exporting vector.
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        const ctx = canvas.getContext("2d");
        if (ctx === null) return;
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        this.#elements.push(
          `<image x="${this.#n(dx)}" y="${this.#n(dy)}" width="${this.#n(dw)}" height="${this.#n(dh)}" href="${canvas.toDataURL()}"${this.#imagePaint()}/>`,
        );
      },

      image: (source, x, y, width, height): void => {
        // Inlined as a data URI so the document stands alone — an export that
        // depends on a live page is not really an export.
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext("2d");
        if (ctx === null) return;
        ctx.drawImage(source, 0, 0);
        this.#elements.push(
          `<image x="${this.#n(x)}" y="${this.#n(y)}" width="${this.#n(width)}" height="${this.#n(height)}" href="${canvas.toDataURL()}"${this.#imagePaint()}/>`,
        );
      },

      line: (x1, y1, x2, y2): void => {
        const s = this.#style;
        if (s.strokeWidth <= 0 || s.stroke[3] <= 0) return;
        this.#elements.push(
          `<line x1="${this.#n(x1)}" y1="${this.#n(y1)}" x2="${this.#n(x2)}" y2="${this.#n(y2)}"${this.#paintAttrs("stroke")}${this.#transformAttr()}/>`,
        );
      },
    };
  }
}

/** One-shot convenience: buffer in, SVG document out. */
export function toSvg(
  buffer: CommandBuffer,
  width: number,
  height: number,
  options: SvgOptions = {},
): string {
  const renderer = new SvgRenderer(width, height, options);
  renderer.render(buffer);
  return renderer.svg;
}

export { escapeXml };
