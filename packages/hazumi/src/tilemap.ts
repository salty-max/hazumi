import type { Camera2D } from "./camera";
import type { SpriteFrame, Spritesheet } from "./spritesheet";
import { getActiveContext } from "./active-context";

/** Sentinel used for a cell that should not be drawn. */
export const EMPTY_TILE = -1;

/** What a character in a drawn map stands for: a frame, or nothing. */
export type TileKey = Readonly<Record<string, number | string | null>>;

/** One row-major tile layer. */
export interface TilemapLayerOptions {
  /** Unique name used by `map.layer(name)`. */
  readonly name: string;
  /** Every tile in a layer shares this texture, so its draw commands batch. */
  readonly sheet: Spritesheet;
  /**
   * The cells, either as `columns * rows` frame indices in row-major order, or
   * as rows of characters read through {@link TilemapLayerOptions.key}.
   *
   * The drawn form exists because a hand-authored map is a picture, and a list
   * of eighty numbers is not one. It also carries its own size, so a map given
   * that way needs no `columns` or `rows`.
   */
  readonly tiles: ArrayLike<number> | readonly string[];
  /** What each character means: a frame index, a frame name, or null for a gap. */
  readonly key?: TileKey;
  /** Whether the layer is drawn. Defaults to true. */
  readonly visible?: boolean;
}

/**
 * How a map is built: its tile size, and the layers stacked on it.
 *
 * Dimensions are optional because a layer drawn as rows of characters already
 * says how wide and tall it is — repeating that is one more thing to get wrong.
 */
export interface TilemapOptions<
  Layers extends readonly TilemapLayerOptions[] = readonly TilemapLayerOptions[],
> {
  /** Defaults to the width of the first layer drawn as rows of characters. */
  readonly columns?: number;
  /** Defaults to the height of the first layer drawn as rows of characters. */
  readonly rows?: number;
  /** Width of a tile in world units. */
  readonly tileWidth: number;
  /** Height of a tile in world units. */
  readonly tileHeight: number;
  /** Drawn in array order, from back to front. */
  readonly layers: Layers;
}

/** The small part of `HazumiContext` needed to draw a tilemap. */
export interface TilemapDrawContext {
  readonly width: number;
  readonly height: number;
  readonly camera: Pick<Camera2D, "x" | "y" | "zoom">;
  image: (source: SpriteFrame, x: number, y: number, width: number, height: number) => void;
}

/**
 * One layer of a map: its own grid of frame indices over one sheet.
 *
 * Cells can be read and written by index or by frame name, and reads outside
 * the map return empty rather than throwing — a lookup at the edge is normal
 * for anything walking neighbours.
 */
export interface TilemapLayer {
  readonly name: string;
  readonly sheet: Spritesheet;
  visible: boolean;
  /** Read a frame index. Cells outside the map are empty. */
  get: (column: number, row: number) => number;
  /** Replace one cell, by frame index or frame name. */
  set: (column: number, row: number, tile: number | string) => void;
  /** Replace every cell in the layer. */
  fill: (tile: number | string) => void;
}

/**
 * Draws the whole map, culled to what the camera can see.
 *
 * Two shapes: the plain call uses the running scene, and the one taking an
 * explicit context is for tools and tests, which have no active scene.
 */
export interface TilemapDraw {
  /** Draw with the active scene at an optional world-space origin. */
  (x?: number, y?: number): void;
  /** Draw with an explicit context, primarily for tools and tests. */
  (context: TilemapDrawContext, x?: number, y?: number): void;
}

/**
 * A stack of tile layers over a shared grid, drawn back to front.
 *
 * `Layer` carries the declared layer names, so `map.layer("walls")` is checked
 * at compile time — and a map typed that way is still assignable wherever a
 * plain `Tilemap` is asked for.
 */
export interface Tilemap<Layer extends string = string> {
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly TilemapLayer[];
  /**
   * Find a layer by its unique name.
   *
   * A method rather than a property, so a map typed on its own layer names
   * stays usable wherever a plain `Tilemap` is asked for.
   */
  layer(name: Layer): TilemapLayer;
  /**
   * Column containing a world x, and the row containing a world y.
   *
   * Not clamped: a point off the map answers with the cell that would be
   * there, which is what a caller testing whether it walked off the edge
   * needs. Pass the same origin the map was drawn at.
   */
  columnAt: (worldX: number, originX?: number) => number;
  rowAt: (worldY: number, originY?: number) => number;
  /** World position of a cell's top-left corner. */
  xOf: (column: number, originX?: number) => number;
  yOf: (row: number, originY?: number) => number;
  /**
   * Draw visible cells at a world-space origin. Defaults to the active scene
   * context and `(0, 0)`; an explicit context remains available for tools and tests.
   */
  draw: TilemapDraw;
}

interface StoredLayer {
  readonly publicLayer: TilemapLayer;
  readonly tiles: Int32Array;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and greater than zero`);
  }
}

function assertTile(tile: number, sheet: Spritesheet, layerName: string): void {
  if (!Number.isSafeInteger(tile) || tile < EMPTY_TILE || tile >= sheet.length) {
    const available = sheet.length === 0 ? "no frames" : `frames 0–${sheet.length - 1}`;
    throw new RangeError(
      `tile ${String(tile)} is invalid for layer ${JSON.stringify(layerName)} (${available})`,
    );
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function isDrawn(tiles: ArrayLike<number> | readonly string[]): tiles is readonly string[] {
  return Array.isArray(tiles) && typeof (tiles as readonly unknown[])[0] === "string";
}

/**
 * Turn a name or an index into an index.
 *
 * Names are resolved against the layer's own sheet, so a map can be written in
 * the vocabulary of the art — `"wall"` rather than `7` — and still store the
 * compact numbers the draw loop wants.
 */
function toTile(tile: number | string, sheet: Spritesheet, layerName: string): number {
  if (typeof tile !== "string") return tile;
  try {
    return sheet.indexOf(tile);
  } catch (cause) {
    throw new RangeError(
      `layer ${JSON.stringify(layerName)} asks for tile ${JSON.stringify(tile)}: ` +
        (cause as Error).message,
    );
  }
}

/**
 * Read a layer written as rows of characters.
 *
 * Every character has to be in the key. A map is drawn by hand and a stray
 * character is a typo — filling it with a gap would hide the mistake in the
 * one place it is hardest to spot, which is a map that looks almost right.
 */
function readDrawn(
  rows: readonly string[],
  option: TilemapLayerOptions,
  columns: number,
  mapRows: number,
): Int32Array {
  const key = option.key;
  if (key === undefined) {
    throw new Error(
      `layer ${JSON.stringify(option.name)} is drawn as rows of characters but has no \`key\` saying what they mean`,
    );
  }
  if (rows.length !== mapRows) {
    throw new RangeError(
      `layer ${JSON.stringify(option.name)} has ${String(rows.length)} rows; expected ${String(mapRows)}`,
    );
  }
  const tiles = new Int32Array(columns * mapRows);
  for (let row = 0; row < mapRows; row++) {
    const line = rows[row] as string;
    if (line.length !== columns) {
      throw new RangeError(
        `layer ${JSON.stringify(option.name)} row ${String(row)} is ${String(line.length)} characters wide; expected ${String(columns)}`,
      );
    }
    for (let column = 0; column < columns; column++) {
      const character = line[column] as string;
      if (!Object.hasOwn(key, character)) {
        throw new RangeError(
          `layer ${JSON.stringify(option.name)} uses ${JSON.stringify(character)} at (${String(column)}, ${String(row)}), which the key does not name`,
        );
      }
      const meaning = key[character] ?? null;
      const tile = meaning === null ? EMPTY_TILE : toTile(meaning, option.sheet, option.name);
      assertTile(tile, option.sheet, option.name);
      tiles[row * columns + column] = tile;
    }
  }
  return tiles;
}

/** Columns and rows, taken from the options or from the first drawn layer. */
function measure(options: TilemapOptions): readonly [number, number] {
  const drawn = options.layers.find((layer) => isDrawn(layer.tiles));
  const rows = drawn === undefined ? undefined : (drawn.tiles as readonly string[]);
  const columns = options.columns ?? (rows === undefined ? undefined : (rows[0]?.length ?? 0));
  const rowCount = options.rows ?? rows?.length;
  if (columns === undefined || rowCount === undefined) {
    throw new Error(
      "tilemap needs `columns` and `rows`, or a layer drawn as rows of characters to take them from",
    );
  }
  return [columns, rowCount];
}

/**
 * Build a mutable, camera-culled tilemap.
 *
 * Layer data is copied once into compact storage. During drawing, only visible
 * cells are visited and every layer emits adjacent frames from one spritesheet,
 * allowing the renderer to keep the layer in one texture batch.
 */
export function tilemap<const Layers extends readonly TilemapLayerOptions[]>(
  options: TilemapOptions<Layers>,
): Tilemap<Layers[number]["name"]> {
  const { tileWidth, tileHeight } = options;
  const [columns, rows] = measure(options);
  assertPositiveInteger(columns, "tilemap columns");
  assertPositiveInteger(rows, "tilemap rows");
  assertPositiveFinite(tileWidth, "tile width");
  assertPositiveFinite(tileHeight, "tile height");

  const cellCount = columns * rows;
  if (!Number.isSafeInteger(cellCount) || cellCount > 0xffff_ffff) {
    throw new RangeError("tilemap dimensions are too large");
  }

  const names = new Set<string>();
  const storedLayers: StoredLayer[] = [];
  const publicLayers: TilemapLayer[] = [];

  for (const option of options.layers) {
    if (option.name.length === 0) throw new Error("tilemap layer name cannot be empty");
    if (names.has(option.name)) {
      throw new Error(`duplicate tilemap layer ${JSON.stringify(option.name)}`);
    }
    names.add(option.name);

    let tiles: Int32Array;
    if (isDrawn(option.tiles)) {
      tiles = readDrawn(option.tiles, option, columns, rows);
    } else {
      if (option.tiles.length !== cellCount) {
        throw new RangeError(
          `layer ${JSON.stringify(option.name)} has ${String(option.tiles.length)} cells; expected ${String(cellCount)}`,
        );
      }
      tiles = new Int32Array(cellCount);
      for (let index = 0; index < cellCount; index++) {
        const tile = (option.tiles as ArrayLike<number>)[index];
        if (tile === undefined) {
          throw new RangeError(
            `layer ${JSON.stringify(option.name)} has a missing cell at ${String(index)}`,
          );
        }
        assertTile(tile, option.sheet, option.name);
        tiles[index] = tile;
      }
    }

    let visible = option.visible ?? true;
    const publicLayer: TilemapLayer = {
      name: option.name,
      sheet: option.sheet,
      get visible(): boolean {
        return visible;
      },
      set visible(next: boolean) {
        visible = next;
      },
      get: (column: number, row: number): number => {
        if (column < 0 || column >= columns || row < 0 || row >= rows) return EMPTY_TILE;
        if (!Number.isInteger(column) || !Number.isInteger(row)) return EMPTY_TILE;
        return tiles[row * columns + column] as number;
      },
      set: (column: number, row: number, tile: number | string): void => {
        if (
          !Number.isInteger(column) ||
          !Number.isInteger(row) ||
          column < 0 ||
          column >= columns ||
          row < 0 ||
          row >= rows
        ) {
          throw new RangeError(
            `tile coordinate (${String(column)}, ${String(row)}) is outside the map`,
          );
        }
        const index = toTile(tile, option.sheet, option.name);
        assertTile(index, option.sheet, option.name);
        tiles[row * columns + column] = index;
      },
      fill: (tile: number | string): void => {
        const index = toTile(tile, option.sheet, option.name);
        assertTile(index, option.sheet, option.name);
        tiles.fill(index);
      },
    };

    publicLayers.push(publicLayer);
    storedLayers.push({ publicLayer, tiles });
  }

  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const draw = (contextOrX?: TilemapDrawContext | number, xOrY = 0, providedY = 0): void => {
    const usesActiveContext = contextOrX === undefined || typeof contextOrX === "number";
    const context = usesActiveContext ? getActiveContext() : contextOrX;
    const x = typeof contextOrX === "number" ? contextOrX : xOrY;
    const y = typeof contextOrX === "number" ? xOrY : providedY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError("tilemap draw origin must be finite");
    }

    const halfViewWidth = context.width / (2 * context.camera.zoom);
    const halfViewHeight = context.height / (2 * context.camera.zoom);
    const firstColumn = clamp(
      Math.floor((context.camera.x - halfViewWidth - x) / tileWidth),
      0,
      columns,
    );
    const lastColumn = clamp(
      Math.ceil((context.camera.x + halfViewWidth - x) / tileWidth),
      0,
      columns,
    );
    const firstRow = clamp(
      Math.floor((context.camera.y - halfViewHeight - y) / tileHeight),
      0,
      rows,
    );
    const lastRow = clamp(Math.ceil((context.camera.y + halfViewHeight - y) / tileHeight), 0, rows);

    if (firstColumn >= lastColumn || firstRow >= lastRow) return;

    for (let layerIndex = 0; layerIndex < storedLayers.length; layerIndex++) {
      const layer = storedLayers[layerIndex] as StoredLayer;
      if (!layer.publicLayer.visible) continue;
      for (let row = firstRow; row < lastRow; row++) {
        const rowStart = row * columns;
        for (let column = firstColumn; column < lastColumn; column++) {
          const tile = layer.tiles[rowStart + column] as number;
          if (tile === EMPTY_TILE) continue;
          context.image(
            layer.publicLayer.sheet.frame(tile),
            x + column * tileWidth,
            y + row * tileHeight,
            tileWidth,
            tileHeight,
          );
        }
      }
    }
  };

  return {
    columns,
    rows,
    tileWidth,
    tileHeight,
    width,
    height,
    layers: publicLayers,
    layer: (name: string): TilemapLayer => {
      for (const layer of publicLayers) {
        if (layer.name === name) return layer;
      }
      throw new Error(
        `unknown tilemap layer ${JSON.stringify(name)}. ` +
          `Available: ${publicLayers.map((layer) => layer.name).join(", ")}`,
      );
    },
    columnAt: (worldX: number, originX = 0): number => Math.floor((worldX - originX) / tileWidth),
    rowAt: (worldY: number, originY = 0): number => Math.floor((worldY - originY) / tileHeight),
    xOf: (column: number, originX = 0): number => originX + column * tileWidth,
    yOf: (row: number, originY = 0): number => originY + row * tileHeight,
    draw,
  };
}
