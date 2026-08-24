/**
 * A chamber, drawn as a picture and read as a map.
 *
 * Tests: tilemaps written as rows of characters, named tiles, clips declared
 * by name, camera culling, and whether a layer really stays in one batch.
 *
 * The map below is the map. Walls, colonnades, a vault and a crypt are laid
 * out where you can see them, which is the whole argument for taking rows of
 * characters rather than eight hundred and sixteen numbers in row-major order:
 * the second form is the same information and nobody can proofread it.
 *
 * Stone is then varied in place, by name — `set(column, row, "floorCracked")`
 * rather than `set(column, row, 379)` — because a hall tiled with one slab
 * repeated eight hundred times reads as a texture, not as a floor. The walls
 * get the same treatment, and learn from their own position which way they
 * face: the run along the top is a different piece from the one down the side.
 *
 * Art: Oryx Design Lab, 16-bit fantasy. Twenty-four pixel cells on a
 * twenty-four pixel margin, which `findGrid` reported and nobody had to count.
 */
import { loadImage, spritesheet, tilemap } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Blend,
  background,
  blendMode,
  circle,
  fill,
  image,
  noStroke,
  text,
  textSize,
} from "hazumi/draw";
import { camera, random, screen, time } from "hazumi/scene";

const TILE = 24;

/** The chamber. Twenty-five squared, which is exactly the frame at this size. */
const GROUND = [
  "#########################",
  "#.......................#",
  "#.......................#",
  "#....................#..#",
  "#....................#..#",
  "#....................#..#",
  "#....................#..#",
  "#.....##.........##..#..#",
  "#.....##.........##..#..#",
  "#....................#..#",
  "#....................#..#",
  "#....................####",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.....##.........##.....#",
  "#.....##.........##.....#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#########################",
] as const;

/** What stands on the floor. A space is a gap, not a tile. */
const PROPS = [
  "                         ",
  "   c C             H     ",
  "                      h  ",
  "                         ",
  "          o   w          ",
  "                       g ",
  "            w            ",
  "                       G ",
  "                         ",
  "                       k ",
  "                         ",
  "         k    b          ",
  "  p                   p  ",
  "   P                     ",
  "                         ",
  "                         ",
  "                         ",
  "            o            ",
  "                         ",
  "                         ",
  "        t T              ",
  "                         ",
  "                         ",
  "   b r               a   ",
  "                         ",
] as const;

/** Slabs the floor is varied with, all of one palette. */
const FLOOR = ["floorInset", "floorCracked", "floorArc"] as const;
/** The run along a horizontal wall: plain, and three that carry a motif. */
const WALL_RUN = ["wallPlain", "wallCarved", "wallSkull", "wallGargoyle"] as const;

/** Torches, in tiles. Set into the stonework, which is where a sconce goes. */
const TORCHES: readonly (readonly [number, number])[] = [
  [4, 1],
  [12, 1],
  [20, 1],
  [4, 23],
  [12, 23],
  [20, 23],
  [6.5, 9],
  [17.5, 18],
];

export function tileField(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2({ smoothing: false }), width: 600, height: 600, parent, seed: 12 },
    async () => {
      const sheetImage = await loadImage("/examples/assets/oryx_16bit_fantasy_world_trans.png");
      const sheet = spritesheet(sheetImage, {
        frame: [24, 24],
        margin: 24,
        frames: {
          // Row seven of the terrain block: one palette of blue-grey stone,
          // floor through wall, so nothing in the room is from another set.
          // The floor is columns three to six — nought to two look like floor
          // at a glance and are a raised panel, which tiles into a room you
          // cannot tell the walls from.
          floor: [3, 7],
          floorInset: [4, 7],
          floorCracked: [5, 7],
          floorArc: [6, 7],
          slab: [0, 7],
          slabCracked: [1, 7],
          slabBroken: [2, 7],
          wallPlain: [9, 7],
          wallCarved: [10, 7],
          wallSkull: [11, 7],
          wallGargoyle: [12, 7],
          wallSide: [13, 7],
          wallPillar: [14, 7],
          // Props, from the block at the top right of the same sheet.
          chest: [31, 3],
          chestOpen: [32, 3],
          barrel: [38, 3],
          barrelOpen: [39, 3],
          crate: [28, 4],
          shelf: [30, 4],
          table: [31, 4],
          altar: [36, 4],
          urnGrey: [36, 5],
          urnBlue: [36, 6],
          urnGreen: [39, 6],
          bones: [31, 0],
          skulls: [36, 0],
          grave: [28, 0],
          web: [28, 1],
          webTorn: [30, 1],
          torchA: [40, 0],
          torchB: [41, 0],
        },
        clips: {
          // Two frames, named rather than numbered: a sconce guttering.
          torch: { frames: ["torchA", "torchB"], fps: 6 },
        },
      });

      const map = tilemap({
        tileWidth: TILE,
        tileHeight: TILE,
        layers: [
          { name: "ground", sheet, key: { "#": "wallPlain", ".": "floor" }, tiles: GROUND },
          {
            name: "props",
            sheet,
            key: {
              " ": null,
              c: "chest",
              C: "chestOpen",
              b: "barrel",
              r: "barrelOpen",
              k: "crate",
              h: "shelf",
              H: "table",
              a: "altar",
              g: "urnGrey",
              G: "urnBlue",
              R: "urnGreen",
              p: "bones",
              P: "skulls",
              t: "grave",
              T: "grave",
              w: "web",
              o: "webTorn",
            },
            tiles: PROPS,
          },
        ],
      });

      // Vary the stone now the structure is in. The walls down the two sides
      // are seen edge-on and take the piece drawn for that; every other wall
      // is a run along the face of one. The floor stays mostly plain and is
      // broken up here and there, which is how a floor is actually laid — vary
      // every slab and it goes back to being a texture.
      const ground = map.layer("ground");
      const plainFloor = sheet.indexOf("floor");
      const plainWall = sheet.indexOf("wallPlain");
      for (let row = 0; row < map.rows; row++) {
        for (let column = 0; column < map.columns; column++) {
          const tile = ground.get(column, row);
          if (tile === plainFloor) {
            if (random.range(0, 1) > 0.22) continue;
            ground.set(column, row, FLOOR[random.int(0, FLOOR.length)] as string);
          } else if (tile === plainWall) {
            const edge = column === 0 || column === map.columns - 1;
            ground.set(
              column,
              row,
              edge
                ? random.range(0, 1) > 0.75
                  ? "wallPillar"
                  : "wallSide"
                : (WALL_RUN[random.int(0, WALL_RUN.length)] as string),
            );
          }
        }
      }

      return {
        draw: (): void => {
          background("oklch(0.07 0.015 265)");

          // The whole chamber, centred. It is exactly the size of the frame at
          // this tile size, so there is nothing to pan to and a room you can
          // read beats a room you have to explore to understand.
          camera.lookAt(map.width / 2, map.height / 2);
          map.draw();

          // The torches themselves, then the light they throw. A chamber lit
          // evenly to the corners is a floor plan; this is most of the
          // difference between a tileset and a place.
          const flame = sheet.clip("torch");
          for (const [column, row] of TORCHES) {
            const x = map.xOf(column);
            const y = map.yOf(row);
            image(flame.at(time.elapsed + column * 0.13), x, y, TILE, TILE);
          }
          noStroke();
          blendMode(Blend.Add);
          for (const [column, row] of TORCHES) {
            const x = map.xOf(column) + TILE / 2;
            const y = map.yOf(row) + TILE / 2;
            const flicker = 1 + Math.sin(time.elapsed * 7 + column) * 0.05;
            for (let ring = 0; ring < 6; ring++) {
              const spread = 1 - ring / 6;
              fill(`oklch(${0.6 + ring * 0.04} ${0.11 + ring * 0.01} ${68 - ring} / 0.055)`);
              circle(x, y, 470 * spread * spread * flicker + 36);
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
