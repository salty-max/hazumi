import type { ImageSource } from "@hazumi/graphics";
import { type AnimationClip, type ClipOptions, createClip } from "./animation";

/**
 * One sprite: a rectangle of source pixels within a sheet.
 *
 * Frames are precomputed when the sheet is built and handed back by reference,
 * so a draw loop asking for the same frame every frame allocates nothing.
 */
export interface SpriteFrame {
  readonly source: ImageSource;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Named animations declared alongside the frames they use. */
export interface ClipsOption {
  readonly clips?: Readonly<Record<string, ClipOptions>>;
}

export interface GridOptions extends ClipsOption {
  /** Size of one cell, in pixels. */
  readonly frame: readonly [number, number];
  /** Gap between cells. Defaults to 0. */
  readonly spacing?: number;
  /** Border around the whole grid. Defaults to 0. */
  readonly margin?: number;
}

export interface NamedOptions extends ClipsOption {
  /** Explicit rectangles, as `[x, y, width, height]`. */
  readonly frames: Readonly<Record<string, readonly [number, number, number, number]>>;
}

export type SpritesheetOptions = GridOptions | NamedOptions;

export class UnknownClipError extends Error {
  readonly clipName: string;

  constructor(name: string, available: readonly string[]) {
    super(
      `No animation named ${JSON.stringify(name)}. ` +
        `Available: ${available.length === 0 ? "(none)" : available.join(", ")}`,
    );
    this.name = "UnknownClipError";
    this.clipName = name;
  }
}

export class UnknownFrameError extends Error {
  readonly frameName: string;

  constructor(name: string, available: readonly string[]) {
    super(
      `No frame named ${JSON.stringify(name)}. ` +
        `Available: ${available.length === 0 ? "(none)" : available.join(", ")}`,
    );
    this.name = "UnknownFrameError";
    this.frameName = name;
  }
}

/**
 * A sliced image.
 *
 * The point of a sheet is that every sprite in it shares one texture, so the
 * renderer can draw all of them in a single call. Separate images cannot merge
 * — batching only joins adjacent instances, and sprites always interleave.
 */
export interface Spritesheet {
  readonly source: ImageSource;
  readonly columns: number;
  readonly rows: number;
  /** Total frames, whether laid out as a grid or named. */
  readonly length: number;
  /** Frame at a grid position, wrapping out-of-range indices. */
  at: (column: number, row?: number) => SpriteFrame;
  /** Frame by linear index, wrapping — convenient for animation. */
  frame: (index: number) => SpriteFrame;
  /** Frame by name. Throws if the sheet has no such frame. */
  named: (name: string) => SpriteFrame;
  /** Every frame, in order. */
  frames: () => readonly SpriteFrame[];
  /**
   * A named animation. Throws if the sheet declares no such clip.
   *
   * ```ts
   * image(hero.clip('run').at(t), x, y);
   * ```
   */
  clip: (name: string) => AnimationClip;
  /** Names of the declared animations. */
  clipNames: () => readonly string[];
}

function isNamed(options: SpritesheetOptions): options is NamedOptions {
  return "frames" in options;
}

/** Positive modulo, so a negative or oversized index wraps rather than failing. */
function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  const r = Math.trunc(value) % size;
  return r < 0 ? r + size : r;
}

/**
 * Slice an image into sprites.
 *
 * ```ts
 * const sheet = spritesheet(img, { frame: [16, 16] });
 * image(sheet.at(3, 1), x, y);
 * ```
 */
export function spritesheet(source: ImageSource, options: SpritesheetOptions): Spritesheet {
  const all: SpriteFrame[] = [];
  const byName = new Map<string, SpriteFrame>();
  let columns = 0;
  let rows = 0;

  if (isNamed(options)) {
    for (const [name, [x, y, width, height]] of Object.entries(options.frames)) {
      const frame: SpriteFrame = { source, x, y, width, height };
      byName.set(name, frame);
      all.push(frame);
    }
    columns = all.length;
    rows = all.length === 0 ? 0 : 1;
  } else {
    const [fw, fh] = options.frame;
    const spacing = options.spacing ?? 0;
    const margin = options.margin ?? 0;

    if (fw <= 0 || fh <= 0) throw new Error("spritesheet frame size must be positive");

    // How many whole cells fit, accounting for the gaps between them.
    columns = Math.max(0, Math.floor((source.width - margin * 2 + spacing) / (fw + spacing)));
    rows = Math.max(0, Math.floor((source.height - margin * 2 + spacing) / (fh + spacing)));

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        all.push({
          source,
          x: margin + column * (fw + spacing),
          y: margin + row * (fh + spacing),
          width: fw,
          height: fh,
        });
      }
    }
  }

  const fallback: SpriteFrame = {
    source,
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
  };

  const resolve = (ref: number | string): SpriteFrame => {
    if (typeof ref === "number") {
      return all.length === 0 ? fallback : (all[wrap(ref, all.length)] as SpriteFrame);
    }
    const named = byName.get(ref);
    if (named === undefined) throw new UnknownFrameError(ref, [...byName.keys()]);
    return named;
  };

  // Clips resolve their frames once, here, so sampling is pure arithmetic.
  const clips = new Map<string, AnimationClip>();
  for (const [name, options_] of Object.entries(options.clips ?? {})) {
    clips.set(
      name,
      createClip(name, options_.frames.map(resolve), {
        ...(options_.fps === undefined ? {} : { fps: options_.fps }),
        ...(options_.end === undefined ? {} : { end: options_.end }),
      }),
    );
  }

  return {
    source,
    columns,
    rows,
    length: all.length,
    clip: (name: string): AnimationClip => {
      const found = clips.get(name);
      if (found === undefined) throw new UnknownClipError(name, [...clips.keys()]);
      return found;
    },
    clipNames: (): readonly string[] => [...clips.keys()],
    at: (column: number, row = 0): SpriteFrame => {
      if (all.length === 0) return fallback;
      return all[wrap(row, rows) * columns + wrap(column, columns)] ?? fallback;
    },
    frame: (index: number): SpriteFrame =>
      all.length === 0 ? fallback : (all[wrap(index, all.length)] as SpriteFrame),
    named: (name: string): SpriteFrame => {
      const frame = byName.get(name);
      if (frame === undefined) throw new UnknownFrameError(name, [...byName.keys()]);
      return frame;
    },
    frames: (): readonly SpriteFrame[] => all,
  };
}

/** True when a draw target is a sheet frame rather than a whole image. */
export function isSpriteFrame(value: ImageSource | SpriteFrame): value is SpriteFrame {
  return "source" in value;
}

/**
 * Crop a frame, relative to the frame origin.
 *
 * `sliceFrame(wall, texX, 1)` is a 1px column. Four numbers are a sub-rectangle.
 * Allocates a new frame — the 8-arg `image()` crop does not, and is the path
 * a draw loop should take.
 */
export function sliceFrame(frame: SpriteFrame, x: number, width: number): SpriteFrame;
export function sliceFrame(
  frame: SpriteFrame,
  x: number,
  y: number,
  width: number,
  height: number,
): SpriteFrame;
export function sliceFrame(
  frame: SpriteFrame,
  x: number,
  yOrWidth: number,
  width?: number,
  height?: number,
): SpriteFrame {
  if (width === undefined || height === undefined) {
    return {
      source: frame.source,
      x: frame.x + x,
      y: frame.y,
      width: yOrWidth,
      height: frame.height,
    };
  }
  return {
    source: frame.source,
    x: frame.x + x,
    y: frame.y + yOrWidth,
    width,
    height,
  };
}
