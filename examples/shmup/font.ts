/**
 * A five-by-seven bitmap font, baked into a texture once at load.
 *
 * The engine already draws text, through a signed-distance-field atlas built
 * from a system font — which is the right default, because it stays sharp at
 * any size. It is the wrong choice here: an SDF rounds a corner it cannot
 * resolve, and a shmup running with `smoothing: false` wants the opposite, a
 * glyph whose every pixel lands on a pixel.
 *
 * So the font is drawn rather than rasterised. The glyphs below are the source
 * art — eight to a bank, read left to right, exactly as they end up in the
 * texture. One texture means one draw call for a whole screen of text, and
 * `tint` recolours it without a second copy.
 *
 * Uppercase only, which is not a shortcut: an arcade cabinet had no lowercase
 * either, and thirty-five pixels is not enough to descend below a baseline.
 */
import { spritesheet, type Spritesheet } from "hazumi/assets";
import { image, noTint, tint } from "hazumi/draw";

/** Five pixels of face and seven tall, with a pixel of gutter after each. */
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const CELL_WIDTH = GLYPH_WIDTH + 1;
const CELL_HEIGHT = GLYPH_HEIGHT + 1;

/**
 * One row of the texture per bank, so the sheet's linear frame index is the
 * position of the character in {@link CHARSET} and nothing has to be mapped.
 */
const BANK_SIZE = 8;

type Bank = readonly [characters: string, rows: readonly string[]];

const BANKS: readonly Bank[] = [
  [
    "ABCDEFGH",
    [
      ".###..####...###..####..#####.#####..###..#...#.",
      "#...#.#...#.#...#.#...#.#.....#.....#...#.#...#.",
      "#...#.#...#.#.....#...#.#.....#.....#.....#...#.",
      "#####.####..#.....#...#.####..####..#.###.#####.",
      "#...#.#...#.#.....#...#.#.....#.....#...#.#...#.",
      "#...#.#...#.#...#.#...#.#.....#.....#...#.#...#.",
      "#...#.####...###..####..#####.#......###..#...#.",
    ],
  ],
  [
    "IJKLMNOP",
    [
      "#####...###.#...#.#.....#...#.#...#..###..####..",
      "..#......#..#..#..#.....##.##.##..#.#...#.#...#.",
      "..#......#..#.#...#.....#.#.#.#.#.#.#...#.#...#.",
      "..#......#..##....#.....#.#.#.#..##.#...#.####..",
      "..#......#..#.#...#.....#...#.#...#.#...#.#.....",
      "..#...#..#..#..#..#.....#...#.#...#.#...#.#.....",
      "#####..##...#...#.#####.#...#.#...#..###..#.....",
    ],
  ],
  [
    "QRSTUVWX",
    [
      ".###..####...####.#####.#...#.#...#.#...#.#...#.",
      "#...#.#...#.#.......#...#...#.#...#.#...#.#...#.",
      "#...#.#...#.#.......#...#...#.#...#.#...#..#.#..",
      "#...#.####...###....#...#...#.#...#.#.#.#...#...",
      "#.#.#.#.#.......#...#...#...#.#...#.#.#.#..#.#..",
      "#..#..#..#......#...#...#...#..#.#..##.##.#...#.",
      ".##.#.#...#.####....#....###....#...#...#.#...#.",
    ],
  ],
  [
    "YZ012345",
    [
      "#...#.#####..###....#....###..####.....#..#####.",
      "#...#.....#.#...#..##...#...#.....#...##..#.....",
      ".#.#.....#..#..##...#.......#.....#..#.#..####..",
      "..#.....#...#.#.#...#......#...###..#..#......#.",
      "..#....#....##..#...#.....#.......#.#####.....#.",
      "..#...#.....#...#...#....#........#....#..#...#.",
      "..#...#####..###...###..#####.####.....#...###..",
    ],
  ],
  [
    "6789 .,:",
    [
      "..##..#####..###...###..........................",
      ".#........#.#...#.#...#.....................#...",
      "#........#..#...#.#...#.....................#...",
      "####....#....###...####.........................",
      "#...#..#....#...#.....#.....................#...",
      "#...#..#....#...#....#................#.....#...",
      ".###...#.....###...##...........#....#..........",
    ],
  ],
  [
    "!?-+/'",
    [
      "..#....###..................#...#...",
      "..#...#...#.........#.......#...#...",
      "..#.......#.........#......#........",
      "..#......#...###...###....#.........",
      "..#.....#...........#....#..........",
      "....................#...#...........",
      "..#.....#...............#...........",
    ],
  ],
];

const CHARSET = BANKS.map(([characters]) => characters).join("");

/** Text drawn from the baked sheet, positioned by the top-left of the line. */
export interface PixelFont {
  /** Width of a line at this scale, trailing gutter excluded. */
  width: (content: string, scale: number) => number;
  /** Height of one line at this scale. */
  height: (scale: number) => number;
  /** Draw a line with its top-left corner at (x, y). */
  draw: (content: string, x: number, y: number, scale: number, color: string) => void;
  /** Draw a line centred on x. */
  centred: (content: string, x: number, y: number, scale: number, color: string) => void;
}

/** Thrown when the page cannot give us a 2D context to bake the font into. */
export class FontBakeError extends Error {
  constructor() {
    super("Could not get a 2D context to bake the bitmap font into.");
    this.name = "FontBakeError";
  }
}

/**
 * Paint the glyphs into a canvas and hand back a sheet over it.
 *
 * White pixels, so `tint` can take them anywhere; everything else stays fully
 * transparent rather than black, or every glyph would carry a box with it.
 */
function bake(): Spritesheet {
  const canvas = document.createElement("canvas");
  canvas.width = BANK_SIZE * CELL_WIDTH;
  canvas.height = BANKS.length * CELL_HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) throw new FontBakeError();

  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let bank = 0; bank < BANKS.length; bank++) {
    const rows = (BANKS[bank] as Bank)[1];
    for (let row = 0; row < rows.length; row++) {
      const line = rows[row] as string;
      const y = bank * CELL_HEIGHT + row;
      for (let x = 0; x < line.length; x++) {
        if (line[x] !== "#") continue;
        const offset = (y * canvas.width + x) * 4;
        pixels.data[offset] = 255;
        pixels.data[offset + 1] = 255;
        pixels.data[offset + 2] = 255;
        pixels.data[offset + 3] = 255;
      }
    }
  }
  context.putImageData(pixels, 0, 0);

  return spritesheet(canvas, { frame: [CELL_WIDTH, CELL_HEIGHT] });
}

export function pixelFont(): PixelFont {
  const sheet = bake();

  const width = (content: string, scale: number): number =>
    Math.max(0, content.length * CELL_WIDTH * scale - scale);

  const draw = (content: string, x: number, y: number, scale: number, color: string): void => {
    tint(color);
    // Whole pixels only. Half a pixel of offset is what turns a bitmap font
    // back into the blur it was chosen to avoid.
    let pen = Math.round(x);
    const top = Math.round(y);
    const cell = CELL_WIDTH * scale;
    for (const character of content.toUpperCase()) {
      const index = CHARSET.indexOf(character);
      // An unknown character advances without drawing, so a stray glyph shows
      // as a hole rather than shunting the rest of the line along.
      if (index >= 0) image(sheet.frame(index), pen, top, cell, CELL_HEIGHT * scale);
      pen += cell;
    }
    noTint();
  };

  return {
    width,
    height: (scale: number): number => GLYPH_HEIGHT * scale,
    draw,
    centred: (content: string, x: number, y: number, scale: number, color: string): void => {
      draw(content, x - width(content, scale) / 2, y, scale, color);
    },
  };
}
