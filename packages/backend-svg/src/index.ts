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
} from "@matter/graphics";

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
    strokeWidth: 0,
    blend: Blend.Normal,
    fontFamily: "sans-serif",
    textSize: 16,
    align: Align.Left,
    baseline: Baseline.Alphabetic,
  };
}

function channel(v: number): number {
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}

function toHex(c: readonly [number, number, number, number]): string {
  const hex = (v: number): string => channel(v).toString(16).padStart(2, "0");
  return `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;
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
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.#width}" height="${this.#height}" viewBox="0 0 ${this.#width} ${this.#height}">`,
      ...this.#elements,
      `</svg>`,
    ]
      .join(separator === "" ? "" : separator)
      .replace("</svg>", `${tail}</svg>`);
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
          `<image x="${this.#n(dx)}" y="${this.#n(dy)}" width="${this.#n(dw)}" height="${this.#n(dh)}" href="${canvas.toDataURL()}"${this.#transformAttr()}/>`,
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
          `<image x="${this.#n(x)}" y="${this.#n(y)}" width="${this.#n(width)}" height="${this.#n(height)}" href="${canvas.toDataURL()}"${this.#transformAttr()}/>`,
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
