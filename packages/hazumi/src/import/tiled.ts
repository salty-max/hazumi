/**
 * A Tiled JSON map, as tilemap options.
 *
 * Tiled is where level layouts come from, and hand-copying a `data` array into
 * source is both tedious and a thing that silently rots the moment the level
 * changes. This reads the export instead.
 *
 * A pure transform, like the Aseprite importer — it does no fetching and holds
 * no images, so the caller supplies a spritesheet per tileset:
 *
 * ```ts
 * const map = tilemap(
 *   fromTiled(await loadJson<TiledMap>("level-1.tmj"), { terrain: terrainSheet }),
 * );
 * ```
 *
 * Scope is the common export: uncompressed tile layers, one tileset per layer.
 * Anything outside that says so rather than rendering something subtly wrong.
 */
import { EMPTY_TILE } from "../tilemap";
import type { Spritesheet } from "../spritesheet";
import type { TilemapLayerOptions, TilemapOptions } from "../tilemap";

export interface TiledLayer {
  readonly type?: string;
  readonly name?: string;
  readonly data?: readonly number[] | string;
  readonly visible?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly encoding?: string;
  readonly compression?: string;
}

export interface TiledTileset {
  readonly firstgid: number;
  readonly name?: string;
  readonly source?: string;
}

export interface TiledMap {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly layers?: readonly TiledLayer[];
  readonly tilesets?: readonly TiledTileset[];
}

/** Thrown when a Tiled map cannot be read, or uses something unsupported. */
export class TiledImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TiledImportError";
  }
}

/**
 * Tiled packs rotation and mirroring into the top bits of each gid.
 *
 * The tilemap has no per-tile transform, so a flipped tile cannot be drawn as
 * the level intends. Masking the bits off silently would paint it the wrong way
 * round, which is worse than refusing.
 */
const FLIP_BITS = 0xe000_0000;

/** The tileset a global id belongs to, or undefined for the empty tile. */
function tilesetFor(gid: number, tilesets: readonly TiledTileset[]): TiledTileset | undefined {
  let match: TiledTileset | undefined;
  for (const tileset of tilesets) {
    if (gid >= tileset.firstgid && (match === undefined || tileset.firstgid > match.firstgid)) {
      match = tileset;
    }
  }
  return match;
}

function sheetName(tileset: TiledTileset): string {
  // An external tileset carries only a path, so fall back to its file stem —
  // that is what a caller would naturally key their sheets by.
  if (tileset.name !== undefined) return tileset.name;
  const source = tileset.source ?? "";
  return source.slice(source.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
}

function readLayer(
  layer: TiledLayer,
  map: TiledMap,
  tilesets: readonly TiledTileset[],
  sheets: Readonly<Record<string, Spritesheet>>,
): TilemapLayerOptions {
  const name = layer.name ?? "(unnamed)";
  const { data } = layer;

  if (typeof data === "string") {
    throw new TiledImportError(
      `Layer ${JSON.stringify(name)} is ${layer.encoding ?? "base64"}-encoded. ` +
        `Export the map with CSV tile layer format.`,
    );
  }
  if (data === undefined) {
    throw new TiledImportError(`Layer ${JSON.stringify(name)} has no tile data.`);
  }

  const columns = layer.width ?? map.width;
  const rows = layer.height ?? map.height;
  if (data.length !== columns * rows) {
    throw new TiledImportError(
      `Layer ${JSON.stringify(name)} holds ${data.length} tiles, but its size is ` +
        `${columns}x${rows} = ${columns * rows}.`,
    );
  }

  const tiles = new Int32Array(data.length);
  let layerTileset: TiledTileset | undefined;

  for (const [index, raw] of data.entries()) {
    if (raw === 0) {
      tiles[index] = EMPTY_TILE;
      continue;
    }
    if ((raw & FLIP_BITS) !== 0) {
      throw new TiledImportError(
        `Layer ${JSON.stringify(name)} flips or rotates a tile, which a tilemap ` +
          `cannot draw. Bake the transform into the tileset instead.`,
      );
    }
    const tileset = tilesetFor(raw, tilesets);
    if (tileset === undefined) {
      throw new TiledImportError(
        `Layer ${JSON.stringify(name)} uses tile ${raw}, which is below every ` +
          `tileset's firstgid.`,
      );
    }
    if (layerTileset === undefined) layerTileset = tileset;
    else if (layerTileset !== tileset) {
      // One texture per layer is what lets the whole layer batch into a single
      // run, so mixing tilesets is a structural mismatch rather than a detail.
      throw new TiledImportError(
        `Layer ${JSON.stringify(name)} draws from both ` +
          `${JSON.stringify(sheetName(layerTileset))} and ` +
          `${JSON.stringify(sheetName(tileset))}. Split it into one layer per tileset.`,
      );
    }
    tiles[index] = raw - tileset.firstgid;
  }

  // An empty layer still needs a sheet, and any will do since nothing is drawn.
  const chosen = layerTileset ?? tilesets[0];
  if (chosen === undefined) {
    throw new TiledImportError(`This map has no tilesets, so layers cannot be resolved.`);
  }
  const key = sheetName(chosen);
  const sheet = sheets[key];
  if (sheet === undefined) {
    throw new TiledImportError(
      `No spritesheet given for tileset ${JSON.stringify(key)}. ` +
        `Available: ${Object.keys(sheets).join(", ") || "(none)"}.`,
    );
  }

  return { name, sheet, tiles, visible: layer.visible ?? true };
}

/**
 * Read a Tiled JSON map as tilemap options.
 *
 * `sheets` is keyed by tileset name. Layers that are not tile layers — object
 * groups, image layers — are skipped rather than rejected: a map legitimately
 * carries them, and they are simply not tiles.
 */
export function fromTiled(
  map: TiledMap,
  sheets: Readonly<Record<string, Spritesheet>>,
): TilemapOptions {
  if (typeof map.width !== "number" || typeof map.tilewidth !== "number") {
    throw new TiledImportError("This JSON has no map size, so it is not a Tiled map.");
  }
  const tilesets = map.tilesets ?? [];
  const tileLayers = (map.layers ?? []).filter(
    (layer) => layer.type === undefined || layer.type === "tilelayer",
  );
  if (tileLayers.length === 0) {
    throw new TiledImportError("This Tiled map has no tile layers.");
  }

  return {
    columns: map.width,
    rows: map.height,
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    layers: tileLayers.map((layer) => readLayer(layer, map, tilesets, sheets)),
  };
}
