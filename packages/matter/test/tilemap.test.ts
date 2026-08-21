import { describe, expect, test } from "bun:test";
import type { ImageSource } from "@matter/graphics";
import { EMPTY_TILE, tilemap, type TilemapDrawContext } from "../src/index";
import { spritesheet } from "../src/spritesheet";

const source = { width: 64, height: 32 } as ImageSource;
const sheet = spritesheet(source, { frame: [16, 16] });

function layer(tiles: ArrayLike<number>, name = "ground") {
  return { name, sheet, tiles };
}

function drawingContext(
  width: number,
  height: number,
  cameraX: number,
  cameraY: number,
  zoom = 1,
): { context: TilemapDrawContext; calls: Array<[number, number, number, number, number]> } {
  const calls: Array<[number, number, number, number, number]> = [];
  return {
    calls,
    context: {
      width,
      height,
      camera: { x: cameraX, y: cameraY, zoom },
      image: (frame, x, y, drawWidth, drawHeight): void => {
        calls.push([frame.x / 16 + (frame.y / 16) * 4, x, y, drawWidth, drawHeight]);
      },
    },
  };
}

describe("tilemap construction", () => {
  test("copies row-major data and exposes predictable dimensions", () => {
    const tiles = [0, 1, 2, 3];
    const map = tilemap({
      columns: 2,
      rows: 2,
      tileWidth: 8,
      tileHeight: 12,
      layers: [layer(tiles)],
    });
    tiles[0] = 7;

    expect(map.width).toBe(16);
    expect(map.height).toBe(24);
    expect(map.layer("ground").get(0, 0)).toBe(0);
    expect(map.layer("ground").get(1, 1)).toBe(3);
    expect(map.layer("ground").get(-1, 0)).toBe(EMPTY_TILE);
  });

  test("supports mutation without exposing its storage", () => {
    const map = tilemap({
      columns: 2,
      rows: 2,
      tileWidth: 16,
      tileHeight: 16,
      layers: [layer([0, 0, 0, 0])],
    });
    const ground = map.layer("ground");

    ground.set(1, 0, 3);
    expect(ground.get(1, 0)).toBe(3);
    ground.fill(EMPTY_TILE);
    expect(ground.get(1, 0)).toBe(EMPTY_TILE);
  });

  test("rejects dimensions, malformed layers, and invalid frame indices", () => {
    expect(() => tilemap({ columns: 0, rows: 1, tileWidth: 1, tileHeight: 1, layers: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      tilemap({ columns: 2, rows: 2, tileWidth: 1, tileHeight: 1, layers: [layer([0])] }),
    ).toThrow("expected 4");
    expect(() =>
      tilemap({ columns: 1, rows: 1, tileWidth: 1, tileHeight: 1, layers: [layer([8])] }),
    ).toThrow(RangeError);
    expect(() =>
      tilemap({
        columns: 1,
        rows: 1,
        tileWidth: 1,
        tileHeight: 1,
        layers: [layer([0]), layer([0])],
      }),
    ).toThrow("duplicate");
  });

  test("rejects invalid edits instead of wrapping to another sprite", () => {
    const map = tilemap({
      columns: 1,
      rows: 1,
      tileWidth: 16,
      tileHeight: 16,
      layers: [layer([0])],
    });

    expect(() => map.layer("ground").set(1, 0, 0)).toThrow(RangeError);
    expect(() => map.layer("ground").set(0, 0, sheet.length)).toThrow(RangeError);
    expect(() => map.layer("missing")).toThrow("unknown");
  });
});

describe("tilemap drawing", () => {
  test("skips empty cells and draws layers back to front", () => {
    const map = tilemap({
      columns: 2,
      rows: 2,
      tileWidth: 10,
      tileHeight: 12,
      layers: [layer([0, EMPTY_TILE, 1, 2]), layer([3, EMPTY_TILE, EMPTY_TILE, 4], "detail")],
    });
    const { context, calls } = drawingContext(20, 24, 10, 12);

    map.draw(context, 5, 7);

    expect(calls).toEqual([
      [0, 5, 7, 10, 12],
      [1, 5, 19, 10, 12],
      [2, 15, 19, 10, 12],
      [3, 5, 7, 10, 12],
      [4, 15, 19, 10, 12],
    ]);
  });

  test("visits only cells intersecting the camera view", () => {
    const tiles = Array.from({ length: 100 }, (_, index) => index % sheet.length);
    const map = tilemap({
      columns: 10,
      rows: 10,
      tileWidth: 16,
      tileHeight: 16,
      layers: [layer(tiles)],
    });
    // View bounds are exactly [32, 64) on both axes: columns and rows 2–3.
    const { context, calls } = drawingContext(32, 32, 48, 48);

    map.draw(context);

    expect(calls).toEqual([
      [6, 32, 32, 16, 16],
      [7, 48, 32, 16, 16],
      [0, 32, 48, 16, 16],
      [1, 48, 48, 16, 16],
    ]);
  });

  test("accounts for zoom and a world-space origin while culling", () => {
    const map = tilemap({
      columns: 4,
      rows: 1,
      tileWidth: 16,
      tileHeight: 16,
      layers: [layer([0, 1, 2, 3])],
    });
    // A 32px canvas at 2x zoom sees 16 world units centred on x=124.
    const { context, calls } = drawingContext(32, 32, 124, 108, 2);

    map.draw(context, 100, 100);

    expect(calls).toEqual([[1, 116, 100, 16, 16]]);
  });

  test("a hidden layer emits no commands and can be enabled later", () => {
    const map = tilemap({
      columns: 1,
      rows: 1,
      tileWidth: 16,
      tileHeight: 16,
      layers: [{ ...layer([2]), visible: false }],
    });
    const { context, calls } = drawingContext(16, 16, 8, 8);

    map.draw(context);
    expect(calls).toEqual([]);

    map.layer("ground").visible = true;
    map.draw(context);
    expect(calls).toEqual([[2, 0, 0, 16, 16]]);
  });
});
