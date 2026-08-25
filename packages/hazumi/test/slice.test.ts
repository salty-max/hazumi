import { describe, expect, test } from "bun:test";
import { findGridIn, findSpritesIn, type PixelSource } from "../src/slice";

/** A pixel source painted by a predicate, so a test can state its shape. */
function painted(
  width: number,
  height: number,
  ink: (x: number, y: number) => boolean,
): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!ink(x, y)) continue;
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Rows of characters, where anything but a dot is ink. */
function fromRows(rows: readonly string[]): PixelSource {
  const width = Math.max(...rows.map((row) => row.length));
  return painted(width, rows.length, (x, y) => (rows[y]?.[x] ?? ".") !== ".");
}

describe("findGrid", () => {
  test("takes each band of ink as a cell when told no size", () => {
    // Three 4px sprites with a 1px gutter between them.
    const sheet = painted(14, 4, (x) => x % 5 !== 4);
    expect(findGridIn(sheet)).toEqual({ frame: [4, 4], columns: [0, 5, 10], rows: [0] });
  });

  test("divides each band into whole cells of a known size", () => {
    // The sheet that started this: 12x13 icons, three to a block, one column
    // of gutter between blocks and none inside one, rows on a 14px pitch.
    const ui = painted(198, 112, (x, y) => x >= 88 && x !== 124 && x !== 161 && y % 14 !== 13);
    const grid = findGridIn(ui, { frame: [12, 13] });
    expect(grid.frame).toEqual([12, 13]);
    expect(grid.columns).toEqual([88, 100, 112, 125, 137, 149, 162, 174, 186]);
    expect(grid.rows).toEqual([0, 14, 28, 42, 56, 70, 84, 98]);
  });

  test("keeps the last cell when the art in it stops short", () => {
    // A 10px band of 4px cells is three cells, the last one holding two pixels
    // of art. Requiring a whole cell to fit dropped it — which on the ORYX
    // dungeon sheet meant a column of fifty-three tiles and a row of forty
    // silently missing, because their art is 23 of 24 pixels wide.
    const sheet = painted(10, 4, () => true);
    expect(findGridIn(sheet, { frame: [4, 4] }).columns).toEqual([0, 4, 8]);
  });

  test("a band too small for one cell still yields one", () => {
    // The other side of that trade. A seven-pixel ship in an eight-pixel cell
    // is a frame; treating the band as too small to describe loses it. A
    // stray speck gets a box it does not deserve, which is visible on the
    // sheet in a way a missing frame never is.
    const sheet = painted(7, 4, () => true);
    expect(findGridIn(sheet, { frame: [8, 8] }).columns).toEqual([0]);
  });

  test("a region picks one layout out of a sheet that holds several", () => {
    // Panels on the left with no row gutters at all, icons on the right on a
    // 14px pitch. Scanned whole, the panels fill every row and the icon pitch
    // disappears; scanned by region, it comes back.
    const mixed = painted(198, 112, (x, y) =>
      x < 80 ? true : x >= 88 && x !== 124 && x !== 161 && y % 14 !== 13,
    );
    expect(findGridIn(mixed, { frame: [12, 13] }).rows).not.toEqual([
      0, 14, 28, 42, 56, 70, 84, 98,
    ]);
    const icons = findGridIn(mixed, { frame: [12, 13], region: [88, 0, 110, 112] });
    expect(icons.columns).toEqual([88, 100, 112, 125, 137, 149, 162, 174, 186]);
    expect(icons.rows).toEqual([0, 14, 28, 42, 56, 70, 84, 98]);
  });

  test("a margin cuts an even grid instead of following the ink", () => {
    // Sprites that float inside their cells: 8px cells whose art starts two
    // pixels in and is five wide. Band-scanning follows the ink and drifts —
    // 2, 10, 18 — where the grid is plainly 0, 8, 16.
    const floating = painted(24, 8, (x) => x % 8 >= 2 && x % 8 <= 6);
    expect(findGridIn(floating, { frame: [8, 8] }).columns).toEqual([2, 10, 18]);
    expect(findGridIn(floating, { frame: [8, 8], margin: 0 }).columns).toEqual([0, 8, 16]);
  });

  test("an even grid drops the cells with nothing in them", () => {
    // Art in the first two cells of a five-cell row. The empty three would
    // otherwise be boxes over nothing, counted as frames.
    const sparse = painted(40, 8, (x) => x < 16);
    expect(findGridIn(sparse, { frame: [8, 8], margin: 0 }).columns).toEqual([0, 8]);
  });

  test("a margin says where the grid starts, per axis", () => {
    // The ORYX sheets: a 24px margin, then 24px tiles.
    const inset = painted(96, 48, (x, y) => x >= 24 && y >= 24);
    const grid = findGridIn(inset, { frame: [24, 24], margin: [24, 24] });
    expect(grid.columns).toEqual([24, 48, 72]);
    expect(grid.rows).toEqual([24]);
  });

  test("an empty image yields no grid instead of throwing", () => {
    expect(findGridIn(painted(8, 8, () => false))).toEqual({
      frame: [0, 0],
      columns: [],
      rows: [],
    });
  });

  test("a threshold ignores a soft halo", () => {
    const width = 6;
    const data = new Uint8ClampedArray(width * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < width; x++) {
        // Solid on the left half, one unit of alpha everywhere else.
        data[(y * width + x) * 4 + 3] = x < 2 ? 255 : 1;
      }
    }
    const sheet: PixelSource = { width, height: 4, data };
    expect(findGridIn(sheet).columns).toHaveLength(1);
    expect(findGridIn(sheet, { threshold: 1 }).frame).toEqual([2, 4]);
  });
});

describe("findSprites", () => {
  test("boxes each island of connected ink", () => {
    const rects = findSpritesIn(fromRows(["##..###", "##...#.", ".......", "....##."]));
    expect(rects).toEqual([
      [0, 0, 2, 2],
      [4, 0, 3, 2],
      [4, 3, 2, 1],
    ]);
  });

  test("a diagonal stays part of the same sprite", () => {
    // Four-way connectivity would call this two sprites and cut the antenna off.
    expect(findSpritesIn(fromRows(["#..", ".#.", "..#"]))).toEqual([[0, 0, 3, 3]]);
  });

  test("boxes come back in reading order", () => {
    // The right-hand sprite starts a scanline lower but shares the row, so it
    // must not sort below the one underneath it.
    const rects = findSpritesIn(fromRows(["#......", "#...##.", "#...##.", ".......", "###...."]));
    expect(rects.map((r) => [r[0], r[1]])).toEqual([
      [0, 0],
      [4, 1],
      [0, 4],
    ]);
  });

  test("a region confines the search, and boxes stay in sheet coordinates", () => {
    const rects = findSpritesIn(fromRows(["##.##", "##.##"]), { region: [3, 0, 2, 2] });
    expect(rects).toEqual([[3, 0, 2, 2]]);
  });

  test("an empty image has no sprites", () => {
    expect(findSpritesIn(painted(8, 8, () => false))).toEqual([]);
  });
});
