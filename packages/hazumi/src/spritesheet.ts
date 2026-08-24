import type { ImageSource } from "@hazumi/graphics";
import { type AnimationClip, type ClipOptions, createClip, InvalidClipError } from "./animation";

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

/**
 * Where a named frame lives.
 *
 * Two numbers are a cell on the sheet's grid, four are an explicit rectangle in
 * sheet pixels. The lengths tell them apart, so a sheet that is mostly a grid
 * with a few odd tiles beside it can name both without a second sheet — and
 * naming a cell reads as `[column, row]` rather than as arithmetic the author
 * did in their head.
 */
export type FrameRef =
  | readonly [column: number, row: number]
  | readonly [x: number, y: number, width: number, height: number];

/**
 * How one axis of a grid is laid out.
 *
 * A number caps how many tracks to cut — useful when a sheet has junk past the
 * last real cell. An array gives their pixel offsets outright, which is the
 * escape hatch for sheets that are not on one cadence: icons in groups of three
 * with a gutter between groups have no single pitch to describe.
 */
export type Track = number | readonly number[];

/** A pair given per axis, or one number used for both. */
export type Axes = number | readonly [x: number, y: number];

/** Named animations declared alongside the frames they use. */
export interface ClipsOption<Clips extends ClipMap = ClipMap> {
  readonly clips?: Clips;
}

export type FrameMap = Readonly<Record<string, FrameRef>>;
export type ClipMap = Readonly<Record<string, ClipOptions>>;

export interface GridOptions<
  Frames extends FrameMap = FrameMap,
  Clips extends ClipMap = ClipMap,
> extends ClipsOption<Clips> {
  /** Size of one cell, in pixels. */
  readonly frame: readonly [width: number, height: number];
  /** Gap between cells, or `[x, y]`. Defaults to 0. */
  readonly spacing?: Axes;
  /** Border around the whole grid, or `[x, y]`. Defaults to 0. */
  readonly margin?: Axes;
  /** Column layout. Defaults to as many whole cells as the image holds. */
  readonly columns?: Track;
  /** Row layout. Defaults to as many whole cells as the image holds. */
  readonly rows?: Track;
  /** Names for cells of the grid, or for rectangles beside it. */
  readonly frames?: Frames;
}

export interface NamedOptions<
  Frames extends FrameMap = FrameMap,
  Clips extends ClipMap = ClipMap,
> extends ClipsOption<Clips> {
  /** Explicit rectangles, as `[x, y, width, height]`. */
  readonly frames: Frames;
}

export type SpritesheetOptions<
  Frames extends FrameMap = FrameMap,
  Clips extends ClipMap = ClipMap,
> = GridOptions<Frames, Clips> | NamedOptions<Frames, Clips>;

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
 * Thrown when a frame is declared somewhere the sheet cannot hold it.
 *
 * A rectangle that hangs off the edge, or a cell past the end of the grid, used
 * to be accepted in silence and drawn as whatever pixels happened to be there —
 * which shows up as a sliver of the neighbouring sprite rather than as an
 * error, and is very hard to see coming.
 */
export class InvalidFrameError extends Error {
  readonly frameName: string;

  constructor(name: string, detail: string) {
    super(`Frame ${JSON.stringify(name)} ${detail}`);
    this.name = "InvalidFrameError";
    this.frameName = name;
  }
}

/** A sliced image. */
export interface Spritesheet<Frame extends string = string, Clip extends string = string> {
  readonly source: ImageSource;
  readonly columns: number;
  readonly rows: number;
  /** Total frames on the grid, or named rectangles when there is no grid. */
  readonly length: number;
  /** Size of one grid cell. Zero on a sheet of named rectangles. */
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Frame at a grid position, wrapping out-of-range indices. */
  at: (column: number, row?: number) => SpriteFrame;
  /** Frame by linear index, wrapping — convenient for animation. */
  frame: (index: number) => SpriteFrame;
  /**
   * Frame by name.
   *
   * Written as a method rather than a property so the name parameter stays
   * bivariant: a `Spritesheet<"idle" | "run">` has to remain usable anywhere a
   * plain `Spritesheet` is asked for, and a strictly contravariant parameter
   * would make the typed sheet the one thing that no longer fits.
   */
  named(name: Frame): SpriteFrame;
  /**
   * Linear index of a named frame, for the places that speak in indices.
   *
   * A tilemap stores cells as numbers, so naming a tile is only useful if the
   * name can become one. Throws when the name is a rectangle of its own rather
   * than a cell — there is no index for something that is not on the grid.
   */
  indexOf(name: Frame): number;
  /** Every frame on the grid, in order. */
  frames: () => readonly SpriteFrame[];
  /**
   * A named animation. Throws if the sheet declares no such clip.
   *
   * ```ts
   * image(hero.clip('run').at(t), x, y);
   * ```
   */
  clip(name: Clip): AnimationClip;
  /** Names of the declared clips. */
  clipNames: () => readonly Clip[];
}

function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  const r = Math.trunc(value) % size;
  return r < 0 ? r + size : r;
}

function isGrid(options: SpritesheetOptions): options is GridOptions {
  return "frame" in options;
}

function pair(value: Axes | undefined, fallback: number): readonly [number, number] {
  if (value === undefined) return [fallback, fallback];
  if (typeof value === "number") return [value, value];
  return value;
}

/**
 * Offsets for one axis of the grid.
 *
 * An explicit array is taken as given; anything else is the regular cadence,
 * cut to however many whole cells the image holds and then capped by a count if
 * one was asked for.
 */
function tracks(
  track: Track | undefined,
  extent: number,
  size: number,
  spacing: number,
  margin: number,
  axis: string,
): readonly number[] {
  if (Array.isArray(track)) {
    for (const offset of track as readonly number[]) {
      if (!Number.isInteger(offset) || offset < 0) {
        throw new RangeError(`spritesheet ${axis} offsets must be whole pixels from zero`);
      }
    }
    return track as readonly number[];
  }
  if (typeof track === "number" && (!Number.isInteger(track) || track < 0)) {
    throw new RangeError(`spritesheet ${axis} count must be a whole number of cells`);
  }
  const fit = Math.max(0, Math.floor((extent - margin * 2 + spacing) / (size + spacing)));
  const count = typeof track === "number" ? Math.min(track, fit) : fit;
  return Array.from({ length: count }, (_, i) => margin + i * (size + spacing));
}

/**
 * Slice an image into sprites.
 *
 * ```ts
 * const sheet = spritesheet(img, { frame: [16, 16] });
 * image(sheet.at(3, 1), x, y);
 * ```
 *
 * A grid and a set of names are not exclusive: give both, and a name may point
 * at a cell of the grid or at a rectangle of its own.
 */
// A grid that names nothing has nothing to look up by name, and says so.
export function spritesheet<Clips extends ClipMap = Record<never, never>>(
  source: ImageSource,
  options: Omit<GridOptions<FrameMap, Clips>, "frames">,
): Spritesheet<never, Extract<keyof Clips, string>>;
// Anything that names frames is typed on the names you wrote.
export function spritesheet<Frames extends FrameMap, Clips extends ClipMap = Record<never, never>>(
  source: ImageSource,
  options: SpritesheetOptions<Frames, Clips>,
): Spritesheet<Extract<keyof Frames, string>, Extract<keyof Clips, string>>;
export function spritesheet(source: ImageSource, options: SpritesheetOptions): Spritesheet {
  const grid: SpriteFrame[] = [];
  const byName = new Map<string, SpriteFrame>();
  let columns = 0;
  let rows = 0;
  let cellWidth = 0;
  let cellHeight = 0;
  const gridded = isGrid(options);

  const check = (name: string, frame: SpriteFrame): SpriteFrame => {
    if (frame.width <= 0 || frame.height <= 0) {
      throw new InvalidFrameError(name, `is ${frame.width}x${frame.height}, which draws nothing.`);
    }
    const overRight = frame.x + frame.width - source.width;
    const overBottom = frame.y + frame.height - source.height;
    if (frame.x < 0 || frame.y < 0 || overRight > 0 || overBottom > 0) {
      throw new InvalidFrameError(
        name,
        `is [${frame.x}, ${frame.y}, ${frame.width}, ${frame.height}], which falls outside a ` +
          `${source.width}x${source.height} sheet` +
          (overRight > 0 ? ` by ${overRight}px on the right` : "") +
          (overBottom > 0 ? ` by ${overBottom}px at the bottom` : "") +
          ".",
      );
    }
    return frame;
  };

  if (gridded) {
    const [fw, fh] = options.frame;
    if (fw <= 0 || fh <= 0) throw new Error("spritesheet frame size must be positive");
    cellWidth = fw;
    cellHeight = fh;
    const [spacingX, spacingY] = pair(options.spacing, 0);
    const [marginX, marginY] = pair(options.margin, 0);
    const xs = tracks(options.columns, source.width, fw, spacingX, marginX, "column");
    const ys = tracks(options.rows, source.height, fh, spacingY, marginY, "row");
    columns = xs.length;
    rows = ys.length;

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        grid.push(
          check(`cell [${column}, ${row}]`, {
            source,
            x: xs[column] as number,
            y: ys[row] as number,
            width: fw,
            height: fh,
          }),
        );
      }
    }
  }

  for (const [name, ref] of Object.entries(options.frames ?? {})) {
    if (ref.length === 2) {
      if (!gridded) {
        throw new InvalidFrameError(
          name,
          `asks for cell [${ref[0]}, ${ref[1]}], but this sheet has no grid to look it up on. ` +
            "Give the sheet a `frame` size, or write the frame out as [x, y, width, height].",
        );
      }
      const [column, row] = ref;
      if (
        !Number.isInteger(column) ||
        !Number.isInteger(row) ||
        column < 0 ||
        column >= columns ||
        row < 0 ||
        row >= rows
      ) {
        throw new InvalidFrameError(
          name,
          `asks for cell [${column}, ${row}] on a grid of ${columns} by ${rows}.`,
        );
      }
      // The same object the grid hands out, so `named` and `at` stay identical
      // and neither path allocates.
      byName.set(name, grid[row * columns + column] as SpriteFrame);
      continue;
    }
    const [x, y, width, height] = ref;
    byName.set(name, check(name, { source, x, y, width, height }));
  }

  // A sheet of nothing but names indexes over those names, in the order they
  // were declared — there is no other order to offer.
  const all = gridded ? grid : [...byName.values()];
  if (!gridded) {
    columns = all.length;
    rows = all.length === 0 ? 0 : 1;
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

  /**
   * A clip's frames, whether listed one by one or asked for as a run.
   *
   * A run is resolved here because this is where the grid is known: `row: 1`
   * means nothing without the column count, and the caller only learns that by
   * dividing the image size themselves — the arithmetic this exists to remove.
   */
  const clipRefs = (name: string, spec: ClipOptions): readonly (number | string)[] => {
    const wantsRun = spec.row !== undefined || spec.from !== undefined || spec.to !== undefined;

    if (spec.frames !== undefined) {
      if (wantsRun) {
        throw new InvalidClipError(
          name,
          "lists its frames and also asks for a run. Use one or the other.",
        );
      }
      return spec.frames;
    }
    if (!wantsRun) {
      throw new InvalidClipError(
        name,
        "has no frames. Give it `frames`, a `row`, or a `from`/`to` run.",
      );
    }
    if (spec.row !== undefined) {
      if (!gridded) {
        throw new InvalidClipError(
          name,
          `asks for row ${spec.row}, but this sheet is declared as named rectangles rather than a grid.`,
        );
      }
      if (!Number.isInteger(spec.row) || spec.row < 0 || spec.row >= rows) {
        throw new InvalidClipError(
          name,
          `asks for row ${spec.row}, but the sheet has ${rows} ${rows === 1 ? "row" : "rows"}.`,
        );
      }
    }

    // Within a row, indices are columns; without one they run over the sheet.
    const base = spec.row === undefined ? 0 : spec.row * columns;
    const span = spec.row === undefined ? all.length : columns;
    const first = spec.from ?? 0;
    const last = spec.to ?? span - 1;

    if (!Number.isInteger(first) || !Number.isInteger(last)) {
      throw new InvalidClipError(
        name,
        `runs from ${first} to ${last}, which are not whole frames.`,
      );
    }
    if (first < 0 || last >= span || first > last) {
      throw new InvalidClipError(
        name,
        `runs from ${first} to ${last}, outside the ${span} ${span === 1 ? "frame" : "frames"} available.`,
      );
    }
    return Array.from({ length: last - first + 1 }, (_, i) => base + first + i);
  };

  // Clips resolve their frames once, here, so sampling is pure arithmetic.
  const clips = new Map<string, AnimationClip>();
  for (const [name, options_] of Object.entries(options.clips ?? {})) {
    clips.set(
      name,
      createClip(name, clipRefs(name, options_).map(resolve), {
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
    cellWidth,
    cellHeight,
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
    indexOf: (name: string): number => {
      const frame = byName.get(name);
      if (frame === undefined) throw new UnknownFrameError(name, [...byName.keys()]);
      const index = all.indexOf(frame);
      if (index < 0) {
        throw new InvalidFrameError(
          name,
          "is a rectangle of its own rather than a cell of the grid, so it has no index.",
        );
      }
      return index;
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
