import type { ImageSource } from "@hazumi/graphics";

/**
 * Anything carrying straight RGBA8 pixels, top-down.
 *
 * `ImageData` is one, and so is the `Pixels` snapshot the raster backends hand
 * back — so a sheet can be scanned from a file or from something the scene drew
 * a moment ago, without a conversion in between.
 */
export interface PixelSource {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** RGBA bytes, four per pixel, row-major. The shape `ImageData` already has. */
  readonly data: Uint8ClampedArray;
}

/** A rectangle in sheet pixels, in the shape `spritesheet` takes. */
export type SliceRect = readonly [x: number, y: number, width: number, height: number];

/** How `findSprites` walks the image. */
export interface ScanOptions {
  /**
   * Alpha at or below which a pixel is background. Defaults to 0.
   *
   * Art exported with a soft edge leaves a halo of one or two alpha, which is
   * enough to weld two sprites into one island. Raise it a little when the
   * boxes come back larger than what you can see.
   */
  readonly threshold?: number;
  /**
   * Part of the sheet to scan, as `[x, y, width, height]`. Defaults to all.
   *
   * One file usually holds several layouts — a block of panels beside a block
   * of icons — and a scan of the whole thing finds the bands of neither.
   * Offsets still come back in sheet coordinates, so they can be handed to
   * `spritesheet` as they are.
   */
  readonly region?: SliceRect;
}

interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function bounds(pixels: PixelSource, region: SliceRect | undefined): Bounds {
  if (region === undefined) {
    return { x: 0, y: 0, width: pixels.width, height: pixels.height };
  }
  const [rx, ry, rw, rh] = region;
  const x = Math.max(0, Math.min(pixels.width, Math.trunc(rx)));
  const y = Math.max(0, Math.min(pixels.height, Math.trunc(ry)));
  return {
    x,
    y,
    width: Math.max(0, Math.min(pixels.width - x, Math.trunc(rw))),
    height: Math.max(0, Math.min(pixels.height - y, Math.trunc(rh))),
  };
}

/** How `findGrid` looks for the cell boundaries. */
export interface GridScanOptions extends ScanOptions {
  /**
   * Cell size, when you already know it.
   *
   * Gutters alone cannot always find the cells: icons packed three to a block
   * with a gap only between blocks have no gutter inside a block to find. Art
   * is authored at a known size, though — so give the size and each block is
   * divided into whole cells of it.
   */
  readonly frame?: readonly [width: number, height: number];
  /**
   * Where the grid starts, in pixels. Given, the scan cuts an even grid.
   *
   * Bands find the cells only when the art fills them. On a sheet drawn with
   * slack inside each cell — a sword floating in an eight-pixel box, its ink
   * starting two pixels in and three pixels down — the bands drift with the
   * art and every offset comes back a little wrong. No scan can recover the
   * origin from that, because the information is not in the pixels: an
   * automatic phase search over the five sample sheets lands on the wrong
   * pixel for two of them.
   *
   * So it is asked for rather than guessed. With a margin and a size the grid
   * is arithmetic — the same two numbers `spritesheet` itself takes — and
   * cells with no ink in them are dropped, so a trailing empty column costs
   * nothing.
   */
  readonly margin?: number | readonly [x: number, y: number];
}

/** A grid, in the shape `spritesheet` takes: spread it straight into the call. */
export interface SheetGrid {
  /** Cell size the scan settled on, in pixels. */
  readonly frame: readonly [width: number, height: number];
  /**
   * Left edge of each column, in pixels.
   *
   * Offsets rather than a pitch, because a sheet is not always on one cadence:
   * icons in groups of three with a gutter between groups have no single step
   * to describe, and this is what `spritesheet({ columns })` accepts.
   */
  readonly columns: readonly number[];
  /** Top edge of each row, in pixels. */
  readonly rows: readonly number[];
}

/** Thrown when the page cannot give us the pixels of an image to scan. */
export class SheetScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetScanError";
  }
}

/** Runs of consecutive true values, as `[start, length]`. */
function runs(occupied: readonly boolean[]): (readonly [number, number])[] {
  const found: (readonly [number, number])[] = [];
  let start = -1;
  for (let i = 0; i <= occupied.length; i++) {
    const on = i < occupied.length && occupied[i] === true;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      found.push([start, i - start]);
      start = -1;
    }
  }
  return found;
}

function inked(pixels: PixelSource, threshold: number): (x: number, y: number) => boolean {
  const { width, data } = pixels;
  return (x: number, y: number): boolean => (data[(y * width + x) * 4 + 3] ?? 0) > threshold;
}

/**
 * Cut each band into whole cells, leaving any remainder alone.
 *
 * A partial cell at the end of a band is not a sprite — it is the two pixels
 * that did not divide, and including it would put a sliver in the sheet.
 */
/**
 * An even run of offsets from `start`, keeping only the cells that hold ink.
 *
 * A sheet is rarely full: the last column of a tileset is often blank, and a
 * block of art can sit in the middle of a lot of nothing. Emitting those
 * anyway would draw boxes over emptiness and count them as frames.
 */
function even(
  start: number,
  end: number,
  size: number,
  hasInk: readonly boolean[],
  origin: number,
): number[] {
  const offsets: number[] = [];
  for (let at = start; at < end; at += size) {
    let any = false;
    for (let i = at; i < Math.min(at + size, end) && !any; i++) any = hasInk[i - origin] === true;
    if (any) offsets.push(at);
  }
  return offsets;
}

/**
 * Step each band by the cell size, keeping the last cell even when the art in
 * it stops short.
 *
 * `i + size <= length` was the obvious condition and it silently lost frames:
 * a cell is only as long as the ink inside it, so a tile drawn 23 pixels wide
 * in a 24-pixel cell ends its band a pixel early and takes the whole cell with
 * it. On the ORYX dungeon sheet that was a column of fifty-three tiles and a
 * row of forty — real art, never shown, with nothing to tell you it was
 * missing.
 *
 * So the walk is over the band's extent rather than over the cells that fit.
 * The trade is the other way now: a band too small to hold one cell still
 * yields one, anchored where its ink starts. That is right more often than it
 * is wrong — a sprite narrower than its cell is common and a stray speck is
 * rare — and either way the tool draws every box it found, so a wrong one can
 * be seen and a missing one cannot.
 */
function cut(bands: readonly (readonly [number, number])[], size: number): number[] {
  const offsets: number[] = [];
  for (const [start, length] of bands) {
    for (let i = 0; i < length; i += size) offsets.push(start + i);
  }
  return offsets;
}

/**
 * Find a sheet's grid from its empty columns and rows.
 *
 * The bands of ink are the blocks; each block is then cut into whole cells of
 * `frame`, or taken whole when no size is given. What comes back spreads
 * straight into `spritesheet`, which is the point — the offsets are exactly the
 * numbers nobody should be counting off a magnified screenshot.
 *
 * ```ts
 * const sheet = spritesheet(img, { ...findGridIn(pixels, { frame: [12, 13] }) });
 * ```
 *
 * This is an authoring tool. Run it, read the numbers, and paste them: a sheet
 * does not change between runs, and scanning every boot buys nothing.
 */
export function findGridIn(pixels: PixelSource, options: GridScanOptions = {}): SheetGrid {
  const threshold = options.threshold ?? 0;
  const ink = inked(pixels, threshold);
  const area = bounds(pixels, options.region);

  const columnHasInk: boolean[] = [];
  for (let x = area.x; x < area.x + area.width; x++) {
    let any = false;
    for (let y = area.y; y < area.y + area.height && !any; y++) any = ink(x, y);
    columnHasInk.push(any);
  }
  const rowHasInk: boolean[] = [];
  for (let y = area.y; y < area.y + area.height; y++) {
    let any = false;
    for (let x = area.x; x < area.x + area.width && !any; x++) any = ink(x, y);
    rowHasInk.push(any);
  }

  const columnBands = runs(columnHasInk).map(([start, n]) => [start + area.x, n] as const);
  const rowBands = runs(rowHasInk).map(([start, n]) => [start + area.y, n] as const);

  if (options.frame !== undefined && options.margin !== undefined) {
    const [width, height] = options.frame;
    if (width <= 0 || height <= 0) return { frame: [0, 0], columns: [], rows: [] };
    const [marginX, marginY] =
      typeof options.margin === "number"
        ? ([options.margin, options.margin] as const)
        : options.margin;
    return {
      frame: [width, height],
      columns: even(area.x + marginX, area.x + area.width, width, columnHasInk, area.x),
      rows: even(area.y + marginY, area.y + area.height, height, rowHasInk, area.y),
    };
  }

  // With no size to go on, a block is a cell — which is right for a sheet with
  // a gutter around every sprite, and the best guess available otherwise.
  const width = options.frame?.[0] ?? Math.min(...columnBands.map(([, n]) => n), Infinity);
  const height = options.frame?.[1] ?? Math.min(...rowBands.map(([, n]) => n), Infinity);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { frame: [0, 0], columns: [], rows: [] };
  }

  return { frame: [width, height], columns: cut(columnBands, width), rows: cut(rowBands, height) };
}

/**
 * Find every island of connected ink, as a rectangle.
 *
 * For sheets with no grid at all — sprites dropped wherever they fit. Eight-way
 * connectivity, so a diagonal antenna stays part of its ship. Boxes come back
 * in reading order, top row first and left to right within a row, because that
 * is the order the eye assigns names in.
 */
export function findSpritesIn(pixels: PixelSource, options: ScanOptions = {}): SliceRect[] {
  const threshold = options.threshold ?? 0;
  const { width } = pixels;
  const area = bounds(pixels, options.region);
  const ink = inked(pixels, threshold);
  const seen = new Uint8Array(width * pixels.height);
  const found: { x: number; y: number; w: number; h: number }[] = [];
  // An explicit stack rather than recursion: a large connected background
  // would blow the call stack, and a sheet is exactly where that happens.
  const stack: number[] = [];

  const lastX = area.x + area.width;
  const lastY = area.y + area.height;
  for (let y = area.y; y < lastY; y++) {
    for (let x = area.x; x < lastX; x++) {
      const start = y * width + x;
      if (seen[start] === 1 || !ink(x, y)) continue;
      seen[start] = 1;
      stack.push(start);
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length > 0) {
        const index = stack.pop() as number;
        const cx = index % width;
        const cy = (index - cx) / width;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < area.x || ny < area.y || nx >= lastX || ny >= lastY) continue;
            const next = ny * width + nx;
            if (seen[next] === 1 || !ink(nx, ny)) continue;
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
      found.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }

  // Rows are decided by overlap, not by the top edge alone: two sprites sat
  // side by side rarely start on the same scanline, and sorting on y would
  // interleave them with the row below.
  found.sort((a, b) => {
    const sameRow = a.y < b.y + b.h && b.y < a.y + a.h;
    return sameRow ? a.x - b.x : a.y - b.y;
  });
  return found.map(({ x, y, w, h }) => [x, y, w, h] as SliceRect);
}

/**
 * Read an image's pixels, through a canvas.
 *
 * Needs a document — there is no other way to get at the pixels of a decoded
 * image — so it is a tool for the browser and for authoring, not something a
 * headless build should reach for.
 */
export function readImagePixels(source: ImageSource): PixelSource {
  if (globalThis.document === undefined) {
    throw new SheetScanError("Reading an image's pixels needs a document to borrow a canvas from.");
  }
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new SheetScanError("Could not get a 2D context to read pixels with.");
  context.drawImage(source, 0, 0);
  return context.getImageData(0, 0, source.width, source.height);
}

/** {@link findGridIn}, straight from a loaded image. */
export function findGrid(source: ImageSource, options: GridScanOptions = {}): SheetGrid {
  return findGridIn(readImagePixels(source), options);
}

/** {@link findSpritesIn}, straight from a loaded image. */
export function findSprites(source: ImageSource, options: ScanOptions = {}): SliceRect[] {
  return findSpritesIn(readImagePixels(source), options);
}
