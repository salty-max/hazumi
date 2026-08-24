import { describe, expect, test } from "bun:test";
import { fromTiled, TiledImportError } from "../src/import/tiled";
import type { TiledMap } from "../src/import/tiled";
import type { Spritesheet } from "../src/spritesheet";
import { EMPTY_TILE } from "../src/tilemap";

/** Tile indices as a plain array, without spreading through an optional. */
function tilesOf(layer: { tiles: ArrayLike<number> | readonly string[] } | undefined): number[] {
  if (layer === undefined) throw new Error("expected a layer");
  // The Tiled importer always emits indices; the drawn form is for hand-written maps.
  return Array.from(layer.tiles as ArrayLike<number>);
}

/** Only identity matters here — the importer never reads into a sheet. */
const terrain = { length: 64 } as unknown as Spritesheet;
const props = { length: 32 } as unknown as Spritesheet;
const sheets = { terrain, props };

function map(partial: Partial<TiledMap> = {}): TiledMap {
  return {
    width: 2,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [{ firstgid: 1, name: "terrain" }],
    layers: [{ type: "tilelayer", name: "ground", data: [1, 2, 3, 4] }],
    ...partial,
  };
}

describe("fromTiled", () => {
  test("carries the map's size and tile size through", () => {
    const options = fromTiled(map(), sheets);
    expect(options.columns).toBe(2);
    expect(options.rows).toBe(2);
    expect(options.tileWidth).toBe(16);
    expect(options.tileHeight).toBe(16);
  });

  test("rebases global ids onto the tileset's own indices", () => {
    // firstgid 1, so Tiled's 1..4 are the sheet's frames 0..3.
    const layer = fromTiled(map(), sheets).layers[0];
    expect(tilesOf(layer)).toEqual([0, 1, 2, 3]);
    expect(layer?.sheet).toBe(terrain);
  });

  test("gid 0 becomes the empty tile rather than frame zero", () => {
    const options = fromTiled(
      map({ layers: [{ type: "tilelayer", name: "ground", data: [0, 1, 0, 2] }] }),
      sheets,
    );
    expect(tilesOf(options.layers[0])).toEqual([EMPTY_TILE, 0, EMPTY_TILE, 1]);
  });

  test("picks the tileset with the highest firstgid at or below the id", () => {
    const options = fromTiled(
      map({
        tilesets: [
          { firstgid: 1, name: "terrain" },
          { firstgid: 65, name: "props" },
        ],
        layers: [{ type: "tilelayer", name: "decor", data: [65, 66, 67, 68] }],
      }),
      sheets,
    );
    expect(options.layers[0]?.sheet).toBe(props);
    expect(tilesOf(options.layers[0])).toEqual([0, 1, 2, 3]);
  });

  test("keeps layer order and visibility", () => {
    const options = fromTiled(
      map({
        layers: [
          { type: "tilelayer", name: "back", data: [1, 1, 1, 1] },
          { type: "tilelayer", name: "front", data: [2, 2, 2, 2], visible: false },
        ],
      }),
      sheets,
    );
    expect(options.layers.map((l) => l.name)).toEqual(["back", "front"]);
    expect(options.layers[1]?.visible).toBe(false);
  });

  test("skips layers that are not tiles instead of rejecting them", () => {
    const options = fromTiled(
      map({
        layers: [
          { type: "objectgroup", name: "spawns" },
          { type: "tilelayer", name: "ground", data: [1, 1, 1, 1] },
        ],
      }),
      sheets,
    );
    expect(options.layers.map((l) => l.name)).toEqual(["ground"]);
  });

  test("refuses a flipped tile rather than drawing it the wrong way round", () => {
    const flipped = 1 | 0x8000_0000;
    expect(() =>
      fromTiled(
        map({ layers: [{ type: "tilelayer", name: "g", data: [flipped, 1, 1, 1] }] }),
        sheets,
      ),
    ).toThrow(/flips or rotates/);
  });

  test("refuses a layer drawing from two tilesets, which could not batch", () => {
    expect(() =>
      fromTiled(
        map({
          tilesets: [
            { firstgid: 1, name: "terrain" },
            { firstgid: 65, name: "props" },
          ],
          layers: [{ type: "tilelayer", name: "mixed", data: [1, 65, 1, 1] }],
        }),
        sheets,
      ),
    ).toThrow(/both "terrain" and "props"/);
  });

  test("names the tileset it has no sheet for", () => {
    expect(() => fromTiled(map(), { props })).toThrow(/No spritesheet given for tileset "terrain"/);
  });

  test("rejects base64 data with the export setting to change", () => {
    expect(() =>
      fromTiled(
        map({ layers: [{ type: "tilelayer", name: "g", data: "AQID", encoding: "base64" }] }),
        sheets,
      ),
    ).toThrow(/CSV tile layer format/);
  });

  test("catches data that does not match the layer's size", () => {
    expect(() =>
      fromTiled(map({ layers: [{ type: "tilelayer", name: "g", data: [1, 2, 3] }] }), sheets),
    ).toThrow(/holds 3 tiles.*2x2 = 4/s);
  });

  test("takes an external tileset's name from its file", () => {
    const options = fromTiled(
      map({ tilesets: [{ firstgid: 1, source: "../tilesets/terrain.tsx" }] }),
      sheets,
    );
    expect(options.layers[0]?.sheet).toBe(terrain);
  });

  test("rejects JSON that is not a Tiled map", () => {
    expect(() => fromTiled({} as unknown as TiledMap, sheets)).toThrow(TiledImportError);
  });

  test("rejects a map with no tile layers", () => {
    expect(() => fromTiled(map({ layers: [] }), sheets)).toThrow(/no tile layers/);
  });
});
