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

const SHEETS = "/examples/assets/schmup";

export interface ShmupArt {
  /** Player and enemy hulls, 8x8. */
  readonly ships: Spritesheet;
  /** Shots and bursts, 8x8. */
  readonly shots: Spritesheet;
  /** Panels, icons and bars, mostly 16x16. */
  readonly ui: Spritesheet;
  /** Five 128x256 star fields, to be tiled and scrolled. */
  readonly sky: Spritesheet;
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
        // A 16x16 frame with a three-pixel border, cut into nine on the fly.
        panel: [0, 0, 16, 16],
        panelLight: [0, 64, 16, 16],
        play: [136, 0, 16, 16],
        pause: [168, 0, 16, 16],
        trophy: [88, 48, 16, 16],
        cross: [88, 32, 16, 16],
      },
    }),
    sky: spritesheet(sky, { frame: [128, 256], spacing: 1 }),
  };
}
