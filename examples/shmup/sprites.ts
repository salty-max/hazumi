/**
 * The sheets, cut into named frames.
 *
 * Named rectangles rather than a grid: only the backdrops are laid out
 * regularly, and inventing a grid for the rest would mean remembering which
 * cell held what every time the game asks for a ship.
 *
 * Art: 8x8 ships and shots, 16x16 interface tiles, 128x256 star fields.
 */
import { loadImage, spritesheet, type Spritesheet } from "hazumi/assets";

import { pixelFont, type PixelFont } from "./font";

const SHEETS = "/examples/assets/schmup";

export interface ShmupArt {
  /** Player and enemy hulls, 8x8. */
  readonly ships: Spritesheet;
  /** Shots and bursts, 8x8. */
  readonly shots: Spritesheet;
  /** Panels on a 16x16 grid, icons on a 12x13 one. */
  readonly ui: Spritesheet;
  /** Five 128x256 star fields, to be tiled and scrolled. */
  readonly sky: Spritesheet;
  /** The 5x7 face every word on screen is set in. */
  readonly font: PixelFont;
}

export async function loadArt(): Promise<ShmupArt> {
  const [ships, shots, ui, sky] = await Promise.all([
    loadImage(`${SHEETS}/ships.png`),
    loadImage(`${SHEETS}/projectiles.png`),
    loadImage(`${SHEETS}/ui.png`),
    loadImage(`${SHEETS}/backgrounds.png`),
  ]);

  return {
    ships: spritesheet(ships, {
      frames: {
        // Left block: one row per colour, three frames across. The outer two
        // are the hull banking, which is what a stick left and right needs.
        playerLeft: [0, 16, 8, 8],
        player: [8, 16, 8, 8],
        playerRight: [16, 16, 8, 8],
        // Right block: a six by six field of hulls. These four are picked for
        // reading clearly at eight pixels against a star field.
        darter: [32, 0, 8, 8],
        weaver: [40, 8, 8, 8],
        gunship: [64, 16, 8, 8],
        hulk: [56, 24, 8, 8],
        // Bottom block, sixteen wide: the thing at the end of a run.
        boss: [32, 40, 16, 24],
      },
    }),
    shots: spritesheet(shots, {
      frames: {
        bolt: [16, 0, 8, 8],
        enemyBolt: [24, 0, 8, 8],
        burst: [16, 8, 8, 8],
        spark: [0, 0, 8, 8],
        shield: [24, 8, 8, 8],
      },
    }),
    ui: spritesheet(ui, {
      frames: {
        // A 16x16 frame with a two-pixel border, cut into nine on the fly.
        panel: [0, 0, 16, 16],
        // The icons are not on the panels' grid, and not on a tidy one of
        // their own either: twelve wide, thirteen tall — twelve of face and a
        // pixel of drop shadow — laid out in threes with a column of gap
        // between each three. Reading them as 16x16 tiles is what put a slice
        // of the neighbouring icon inside every button.
        play: [125, 0, 12, 13],
        cross: [88, 28, 12, 13],
        up: [125, 28, 12, 13],
        down: [162, 28, 12, 13],
        trophy: [88, 42, 12, 13],
        right: [125, 42, 12, 13],
        left: [162, 42, 12, 13],
      },
    }),
    sky: spritesheet(sky, { frame: [128, 256], spacing: 1 }),
    font: pixelFont(),
  };
}
