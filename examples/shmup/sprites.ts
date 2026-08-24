/**
 * The sheets, cut into named frames.
 *
 * Names rather than bare indices, because `ships.frame(11)` tells the reader
 * nothing and `ships.named("gunship")` tells them everything. Each sheet hands
 * back its own names as types, so a misspelling is caught here rather than on
 * the frame the game first tries to draw it.
 *
 * Art: 8x8 ships and shots, 12x13 interface icons beside 16x16 panels, and
 * 128x256 star fields.
 */
import { loadImage, ninePatch, spritesheet, type NinePatch, type Spritesheet } from "hazumi/assets";

import { pixelFont, type PixelFont } from "./font";

const SHEETS = "/examples/assets/schmup";

export type ShipFrame =
  | "playerLeft"
  | "player"
  | "playerRight"
  | "darter"
  | "weaver"
  | "gunship"
  | "hulk"
  | "boss";
export type ShotFrame = "bolt" | "enemyBolt" | "burst" | "spark" | "shield";
export type IconFrame = "play" | "cross" | "up" | "down" | "trophy" | "right" | "left";

export interface ShmupArt {
  /** Player and enemy hulls, 8x8. */
  readonly ships: Spritesheet<ShipFrame>;
  /** Shots and bursts, 8x8. */
  readonly shots: Spritesheet<ShotFrame>;
  /** Interface icons, on a 12x13 grid of their own. */
  readonly ui: Spritesheet<IconFrame>;
  /** The dialogue box, cut into nine once. */
  readonly panel: NinePatch;
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

  /**
   * The icons are not on the panels' grid, and not on a tidy one of their own
   * either: twelve wide and thirteen tall — twelve of face and a pixel of drop
   * shadow — laid out in threes with a column of gutter between each three.
   * Reading them as 16x16 tiles is what put a slice of the neighbouring icon
   * inside every button.
   *
   * The offsets are what `findGrid(ui, { frame: [12, 13], region: [88, 0, 110,
   * 112] })` answers. They are pasted rather than computed, because the sheet
   * does not change between runs and a scan every boot buys nothing.
   */
  const icons = spritesheet(ui, {
    frame: [12, 13],
    columns: [88, 100, 112, 125, 137, 149, 162, 174, 186],
    rows: [0, 14, 28, 42, 56, 70, 84, 98],
    frames: {
      play: [3, 0],
      cross: [0, 2],
      up: [3, 2],
      down: [6, 2],
      trophy: [0, 3],
      right: [3, 3],
      left: [6, 3],
    },
  });

  const panels = spritesheet(ui, { frames: { panel: [0, 0, 16, 16] } });

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
    ui: icons,
    // A 16x16 tile with a two-pixel border, from the block of panels on the
    // left of the sheet. Cut into nine once here rather than every frame.
    panel: ninePatch(panels.named("panel"), 5, { scale: 3 }),
    sky: spritesheet(sky, { frame: [128, 256], spacing: 1 }),
    font: pixelFont(),
  };
}
