/**
 * A chamber, drawn as a picture and read as a map.
 *
 * Tests: tilemaps written as rows of characters, named tiles, camera culling,
 * and whether a layer really does stay in one texture batch.
 *
 * The map below is the map. Walls, windows, colonnades and alcoves are laid
 * out where you can see them, which is the whole argument for taking rows of
 * characters instead of seven hundred and four numbers in row-major order: the
 * second form is the same information and nobody can proofread it.
 *
 * The floor is then varied in place, by name — `set(column, row, "dirtStones")`
 * rather than `set(column, row, 30)` — because a chamber tiled with one stone
 * repeated seven hundred times reads as a texture, not as a floor.
 */
import { loadImage, spritesheet, tilemap } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { Blend, background, blendMode, circle, fill, noStroke, text, textSize } from "hazumi/draw";
import { camera, random, screen, time } from "hazumi/scene";

const TILE = 40;

/** The chamber. Thirty-two across, twenty-two down, and legible as it stands. */
const GROUND = [
  "#######o#######o#######o########",
  "#..............................#",
  "#..............................#",
  "#.......................#####..#",
  "#.......................#...#..#",
  "#....#....#.....#....#....#....#",
  "#....#....#.....#....#....#....#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#....#....#.....#....#....#....#",
  "#....#....#.....#....#....#....#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#..#####.......................#",
  "#..#...#.......................#",
  "#..............................#",
  "################################",
] as const;

/** What stands on the floor. A space is a gap, not a tile. */
const PROPS = [
  "                                ",
  "  b B       g      r            ",
  "                                ",
  "                                ",
  "                          c     ",
  "                                ",
  "                                ",
  "                                ",
  "        c                       ",
  "                                ",
  "                                ",
  "                                ",
  "  g                          r  ",
  "                                ",
  "                                ",
  "                                ",
  "                      b         ",
  "                                ",
  "                                ",
  "     b                          ",
  "                            B   ",
  "                                ",
] as const;

/**
 * Where the light falls, in tiles.
 *
 * A chamber lit evenly to the corners is a floor plan. These are the pools a
 * few torches would throw, laid over the map additively, and they are most of
 * the difference between a tileset and a place.
 */
const LIGHTS: readonly (readonly [number, number])[] = [
  [7.5, 3],
  [24, 6],
  [15.5, 10],
  [5.5, 16],
  [26, 17.5],
];

/** The stones the floor is varied with, all of one palette. */
const FLOOR = [
  "cobble",
  "cobbleWorn",
  "cobbleCracked",
  "cobbleChipped",
  "dirt",
  "dirtStones",
  "dirtPebbles",
  "dirtBare",
] as const;

export function tileField(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2({ smoothing: false }), width: 600, height: 600, parent, seed: 12 },
    async () => {
      const image = await loadImage("/examples/assets/dungeon-tiles.png");
      const sheet = spritesheet(image, {
        frame: [16, 16],
        frames: {
          wall: [6, 4],
          window: [7, 5],
          cobble: [2, 2],
          cobbleWorn: [3, 2],
          cobbleCracked: [4, 2],
          cobbleChipped: [5, 2],
          dirt: [2, 3],
          dirtStones: [3, 3],
          dirtPebbles: [4, 3],
          dirtBare: [5, 3],
          barrel: [1, 0],
          shelf: [2, 0],
          bannerGreen: [3, 0],
          bannerRed: [4, 0],
          bench: [5, 1],
        },
      });

      const map = tilemap({
        tileWidth: TILE,
        tileHeight: TILE,
        layers: [
          {
            name: "ground",
            sheet,
            key: { "#": "wall", o: "window", ".": "cobble" },
            tiles: GROUND,
          },
          {
            name: "props",
            sheet,
            key: {
              " ": null,
              b: "barrel",
              B: "shelf",
              g: "bannerGreen",
              r: "bannerRed",
              c: "bench",
            },
            tiles: PROPS,
          },
        ],
      });

      // Break up the floor now that the structure is in. Only the cells the
      // map called floor are touched, so the walls stay where they were drawn.
      const ground = map.layer("ground");
      const plain = sheet.indexOf("cobble");
      for (let row = 0; row < map.rows; row++) {
        for (let column = 0; column < map.columns; column++) {
          if (ground.get(column, row) !== plain) continue;
          ground.set(column, row, FLOOR[random.int(0, FLOOR.length)] as string);
        }
      }

      return {
        draw: (): void => {
          background("oklch(0.09 0.015 60)");

          // A slow wander, kept inside the walls. The map draws only the cells
          // the camera can actually see, which at this size is about a fifth
          // of them.
          const t = time.elapsed * 0.13;
          camera.lookAt(
            map.width / 2 + Math.cos(t) * (map.width / 2 - screen.width / 2),
            map.height / 2 + Math.sin(t * 1.31) * (map.height / 2 - screen.height / 2),
          );
          map.draw();

          noStroke();
          blendMode(Blend.Add);
          for (const [column, row] of LIGHTS) {
            const x = map.xOf(column);
            const y = map.yOf(row);
            // Guttering, each on its own phase, so no two flicker together.
            const flicker = 1 + Math.sin(time.elapsed * 6 + column) * 0.04;
            // Six rings rather than three: additive discs stack into visible
            // steps otherwise, and a torch does not have contour lines.
            for (let ring = 0; ring < 6; ring++) {
              const spread = 1 - ring / 6;
              fill(`oklch(${0.6 + ring * 0.04} ${0.12 + ring * 0.01} ${66 - ring} / 0.062)`);
              circle(x, y, 480 * spread * spread * flicker + 40);
            }
          }
          blendMode(Blend.Normal);

          camera.screen(() => {
            fill("oklch(0.9 0.03 80 / 0.75)");
            textSize(13);
            text(
              `${map.columns}x${map.rows} tiles · 2 layers · one texture`,
              16,
              screen.height - 18,
            );
          });
        },
      };
    },
  );
}
