import type { Camera2D } from "./camera";
import type { SpriteFrame, Spritesheet } from "./spritesheet";
import { getActiveContext } from "./active-context";

/** Sentinel used for a cell that should not be drawn. */
export const EMPTY_TILE = -1;

/** One row-major tile layer. */
export interface TilemapLayerOptions {
  /** Unique name used by `map.layer(name)`. */
  readonly name: string;
  /** Every tile in a layer shares this texture, so its draw commands batch. */
  readonly sheet: Spritesheet;
  /** `columns * rows` frame indices in row-major order. Use `EMPTY_TILE` for gaps. */
  readonly tiles: ArrayLike<number>;
  /** Whether the layer is drawn. Defaults to true. */
  readonly visible?: boolean;
}

export interface TilemapOptions {
  readonly columns: number;
  readonly rows: number;
  /** Width of a tile in world units. */
  readonly tileWidth: number;
  /** Height of a tile in world units. */
  readonly tileHeight: number;
  /** Drawn in array order, from back to front. */
  readonly layers: readonly TilemapLayerOptions[];
}

/** The small part of `HazumiContext` needed to draw a tilemap. */
export interface TilemapDrawContext {
  readonly width: number;
  readonly height: number;
  readonly camera: Pick<Camera2D, "x" | "y" | "zoom">;
  image: (source: SpriteFrame, x: number, y: number, width: number, height: number) => void;
}

export interface TilemapLayer {
  readonly name: string;
  readonly sheet: Spritesheet;
  visible: boolean;
  /** Read a frame index. Cells outside the map are empty. */
  get: (column: number, row: number) => number;
  /** Replace one cell. Throws for an invalid coordinate or frame index. */
  set: (column: number, row: number, tile: number) => void;
  /** Replace every cell in the layer. */
  fill: (tile: number) => void;
}

export interface TilemapDraw {
  /** Draw with the active scene at an optional world-space origin. */
  (x?: number, y?: number): void;
  /** Draw with an explicit context, primarily for tools and tests. */
  (context: TilemapDrawContext, x?: number, y?: number): void;
}

export interface Tilemap {
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly TilemapLayer[];
  /** Find a layer by its unique name. */
  layer: (name: string) => TilemapLayer;
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

/**
 * Build a mutable, camera-culled tilemap.
 *
 * Layer data is copied once into compact storage. During drawing, only visible
 * cells are visited and every layer emits adjacent frames from one spritesheet,
 * allowing the renderer to keep the layer in one texture batch.
 */
export function tilemap(options: TilemapOptions): Tilemap {
  const { columns, rows, tileWidth, tileHeight } = options;
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

    if (option.tiles.length !== cellCount) {
      throw new RangeError(
        `layer ${JSON.stringify(option.name)} has ${String(option.tiles.length)} cells; expected ${String(cellCount)}`,
      );
    }

    const tiles = new Int32Array(cellCount);
    for (let index = 0; index < cellCount; index++) {
      const tile = option.tiles[index];
      if (tile === undefined) {
        throw new RangeError(
          `layer ${JSON.stringify(option.name)} has a missing cell at ${String(index)}`,
        );
      }
      assertTile(tile, option.sheet, option.name);
      tiles[index] = tile;
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
      set: (column: number, row: number, tile: number): void => {
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
        assertTile(tile, option.sheet, option.name);
        tiles[row * columns + column] = tile;
      },
      fill: (tile: number): void => {
        assertTile(tile, option.sheet, option.name);
        tiles.fill(tile);
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
      throw new Error(`unknown tilemap layer ${JSON.stringify(name)}`);
    },
    draw,
  };
}
