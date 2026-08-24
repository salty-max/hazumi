/**
 * A roguelike floor, generated and then dressed.
 *
 * Tests: tilemaps fed from rows of characters, named tiles, layers, clips
 * declared by name, two sheets in two batches, and depth sorting.
 *
 * The floor is a binary space partition, which is the oldest room-and-corridor
 * generator there is and still the one that reads best. The grid is split in
 * two, each half is split again, and so on until a piece is too small to
 * divide; a room is carved inside each of the pieces that are left, with a
 * margin all round so that no two rooms can ever touch. Coming back up the
 * tree, each pair of siblings is joined by one L-shaped corridor. That last
 * step is what makes the result a dungeon rather than a scatter of rooms: every
 * split is connected to its own sibling, so by induction the whole floor is.
 *
 * The generator writes rows of characters — the same thing a level designer
 * would have drawn by hand — and the tilemap reads them through a key. Nothing
 * about the map knows it was generated.
 *
 * Nobody walks. Each creature stands where it was placed and plays its own two
 * frames on its own phase, so the room is alive without anything pretending to
 * have somewhere to be. What moves is the light.
 *
 * Art: Oryx Design Lab, 16-bit fantasy. See examples/assets/CREDITS.md.
 */
import { loadImage, spritesheet, tilemap } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Blend,
  background,
  blendMode,
  circle,
  ellipse,
  fill,
  image,
  noStroke,
  text,
  textSize,
} from "hazumi/draw";
import { camera, random, screen, time } from "hazumi/scene";

const TILE = 24;
const COLUMNS = 25;
const ROWS = 25;

/**
 * A piece too small to divide again, and the smallest room worth carving.
 *
 * The leaf size decides how many rooms come out: a piece can only split while
 * both halves would still be at least this wide, so raising it by two roughly
 * halves the floor plan. Six against a twenty-three-cell span gives three
 * levels of splitting and somewhere between four and nine rooms.
 */
const MIN_LEAF = 6;
const MIN_ROOM = 4;

interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function centre(room: Area): Point {
  return { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
}

/** Who stands in the rooms, and how large each is drawn. */
const CAST = [
  { clip: "knight", scale: 2 },
  { clip: "guard", scale: 2 },
  { clip: "ranger", scale: 1.9 },
  { clip: "mage", scale: 1.9 },
  { clip: "goblin", scale: 1.7 },
  { clip: "goblinSpear", scale: 1.7 },
  { clip: "skeleton", scale: 1.8 },
  { clip: "slime", scale: 1.6 },
  { clip: "bat", scale: 1.4 },
  { clip: "rat", scale: 1.3 },
  { clip: "wolf", scale: 1.8 },
] as const;

/** Things to leave lying about, and how often each turns up. */
const DRESSING = ["c", "C", "b", "r", "k", "h", "H", "a", "g", "G", "R", "p", "P", "t", "w", "o"];

interface Creature {
  readonly x: number;
  readonly y: number;
  readonly clip: (typeof CAST)[number]["clip"];
  readonly scale: number;
  readonly offset: number;
  readonly hover: number;
}

interface Floor {
  readonly ground: string[];
  readonly props: string[];
  readonly rooms: readonly Area[];
  readonly torches: readonly Point[];
  readonly creatures: readonly Creature[];
}

/**
 * Cut a floor out of solid rock.
 *
 * Everything here draws from the scene's seeded generator, so the same seed is
 * the same dungeon — which is what makes a still of it worth capturing.
 */
function generate(): Floor {
  const rock: string[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLUMNS }, () => "#"),
  );
  const rooms: Area[] = [];

  const carveRoom = (area: Area): Area => {
    // Inset by at least one, so two rooms in neighbouring pieces always have
    // rock between them however the split fell.
    const width = random.int(MIN_ROOM, Math.max(MIN_ROOM + 1, area.width - 1));
    const height = random.int(MIN_ROOM, Math.max(MIN_ROOM + 1, area.height - 1));
    const x = area.x + random.int(1, Math.max(2, area.width - width));
    const y = area.y + random.int(1, Math.max(2, area.height - height));
    const room = { x, y, width, height };
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++) {
        (rock[row] as string[])[column] = ".";
      }
    }
    rooms.push(room);
    return room;
  };

  const carveCorridor = (from: Point, to: Point): void => {
    // An elbow: all the way along one axis, then all the way along the other.
    // Which one goes first is a coin toss, and it is the only thing keeping
    // the floor from looking like it was laid out with a set square.
    const horizontalFirst = random.bool();
    const dig = (x: number, y: number): void => {
      if (y < 0 || y >= ROWS || x < 0 || x >= COLUMNS) return;
      if ((rock[y] as string[])[x] === "#") (rock[y] as string[])[x] = ",";
    };
    if (horizontalFirst) {
      for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) dig(x, from.y);
      for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) dig(to.x, y);
    } else {
      for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) dig(from.x, y);
      for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) dig(x, to.y);
    }
  };

  /** Split, recurse, then join the two halves. Returns a point to join to. */
  const partition = (area: Area, depth: number): Point => {
    const canSplitDown = area.height >= MIN_LEAF * 2;
    const canSplitAcross = area.width >= MIN_LEAF * 2;
    if (depth === 0 || (!canSplitDown && !canSplitAcross)) return centre(carveRoom(area));

    // Split the long way when a piece is clearly oblong, so nothing ends up a
    // corridor-shaped room; toss for it when it is roughly square.
    const across = !canSplitDown || (canSplitAcross && (area.width > area.height || random.bool()));
    let first: Area;
    let second: Area;
    if (across) {
      const at = random.int(MIN_LEAF, area.width - MIN_LEAF + 1);
      first = { x: area.x, y: area.y, width: at, height: area.height };
      second = { x: area.x + at, y: area.y, width: area.width - at, height: area.height };
    } else {
      const at = random.int(MIN_LEAF, area.height - MIN_LEAF + 1);
      first = { x: area.x, y: area.y, width: area.width, height: at };
      second = { x: area.x, y: area.y + at, width: area.width, height: area.height - at };
    }
    const a = partition(first, depth - 1);
    const b = partition(second, depth - 1);
    carveCorridor(a, b);
    return random.bool() ? a : b;
  };

  partition({ x: 1, y: 1, width: COLUMNS - 2, height: ROWS - 2 }, 4);

  // Dress the rooms. Props hug the walls, because the middle of a room is
  // where you walk and a barrel in it reads as an obstacle nobody placed.
  const props: string[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLUMNS }, () => " "),
  );
  const torches: Point[] = [];
  const creatures: Creature[] = [];

  for (const room of rooms) {
    const count = random.int(1, 4);
    for (let i = 0; i < count; i++) {
      const alongTop = random.bool();
      const x = room.x + random.int(0, room.width);
      const y = alongTop ? room.y : room.y + room.height - 1;
      (props[y] as string[])[x] = DRESSING[random.int(0, DRESSING.length)] as string;
    }

    // One sconce per room, in the rock above it where a wall face is drawn.
    // Two looked generous until the floor plan grew to nine rooms and the
    // pools ran together into daylight; a dungeon wants the dark between them.
    torches.push({ x: room.x + random.int(1, Math.max(2, room.width - 1)), y: room.y - 1 });

    // And its inhabitants, on the floor and clear of the walls.
    const population = Math.min(4, Math.max(1, Math.floor((room.width * room.height) / 12)));
    for (let i = 0; i < population; i++) {
      const part = CAST[random.int(0, CAST.length)] as (typeof CAST)[number];
      creatures.push({
        x: room.x + random.range(0.6, room.width - 0.6),
        y: room.y + random.range(1, room.height - 0.2),
        clip: part.clip,
        scale: part.scale,
        offset: random.range(0, 4),
        hover: part.clip === "bat" ? 22 : 0,
      });
    }
  }

  return {
    ground: rock.map((row) => row.join("")),
    props: props.map((row) => row.join("")),
    rooms,
    torches,
    creatures,
  };
}

export function dungeon(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2({ smoothing: false }), width: 600, height: 600, parent, seed: 9 },
    async () => {
      const [worldImage, creatureImage] = await Promise.all([
        loadImage("/examples/assets/oryx_16bit_fantasy_world_trans.png"),
        loadImage("/examples/assets/oryx_16bit_fantasy_creatures_trans.png"),
      ]);

      const tiles = spritesheet(worldImage, {
        frame: [24, 24],
        margin: 24,
        frames: {
          // One palette of blue-grey stone, floor through wall. The floor is
          // columns three to six; nought to two look like floor at a glance
          // and are a raised panel, which is what the top of a wall is.
          floor: [3, 7],
          floorInset: [4, 7],
          floorCracked: [5, 7],
          floorArc: [6, 7],
          rock: [0, 7],
          rockCracked: [1, 7],
          rockBroken: [2, 7],
          wallPlain: [9, 7],
          wallCarved: [10, 7],
          wallSkull: [11, 7],
          wallGargoyle: [12, 7],
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
        clips: { torch: { frames: ["torchA", "torchB"], fps: 6 } },
      });

      const cast = spritesheet(creatureImage, {
        frame: [24, 24],
        margin: 24,
        frames: {
          knightA: [0, 0],
          knightB: [0, 1],
          guardA: [2, 0],
          guardB: [2, 1],
          rangerA: [12, 6],
          rangerB: [12, 7],
          mageA: [5, 6],
          mageB: [5, 7],
          goblinA: [0, 14],
          goblinB: [0, 15],
          goblinSpearA: [2, 14],
          goblinSpearB: [2, 15],
          skeletonA: [2, 16],
          skeletonB: [2, 17],
          slimeA: [1, 12],
          slimeB: [1, 13],
          batA: [3, 12],
          batB: [3, 13],
          ratA: [7, 12],
          ratB: [7, 13],
          wolfA: [0, 10],
          wolfB: [0, 11],
        },
        clips: {
          // Two frames apiece, named rather than numbered — which is the
          // difference between reading this list and decoding it.
          knight: { frames: ["knightA", "knightB"], fps: 4 },
          guard: { frames: ["guardA", "guardB"], fps: 4 },
          ranger: { frames: ["rangerA", "rangerB"], fps: 5 },
          mage: { frames: ["mageA", "mageB"], fps: 3 },
          goblin: { frames: ["goblinA", "goblinB"], fps: 6 },
          goblinSpear: { frames: ["goblinSpearA", "goblinSpearB"], fps: 6 },
          skeleton: { frames: ["skeletonA", "skeletonB"], fps: 5 },
          slime: { frames: ["slimeA", "slimeB"], fps: 2 },
          bat: { frames: ["batA", "batB"], fps: 12 },
          rat: { frames: ["ratA", "ratB"], fps: 9 },
          wolf: { frames: ["wolfA", "wolfB"], fps: 7 },
        },
      });

      const floor = generate();

      const map = tilemap({
        tileWidth: TILE,
        tileHeight: TILE,
        layers: [
          {
            name: "ground",
            sheet: tiles,
            key: { "#": "rock", ".": "floor", ",": "floorCracked" },
            tiles: floor.ground,
          },
          {
            name: "props",
            sheet: tiles,
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
              w: "web",
              o: "webTorn",
            },
            tiles: floor.props,
          },
        ],
      });

      // Rock that has floor directly below it is seen face-on and takes the
      // wall pieces; everything else is the top of the wall, looked down on.
      // The floor itself is broken up here and there rather than everywhere,
      // which is how a floor is actually laid.
      const ground = map.layer("ground");
      const solidRock = tiles.indexOf("rock");
      const plainFloor = tiles.indexOf("floor");
      const WALL_RUN = ["wallPlain", "wallCarved", "wallSkull", "wallGargoyle"] as const;
      const FLOOR = ["floorInset", "floorCracked", "floorArc"] as const;
      const ROCK = ["rockCracked", "rockBroken"] as const;
      for (let row = 0; row < map.rows; row++) {
        for (let column = 0; column < map.columns; column++) {
          const tile = ground.get(column, row);
          if (tile === solidRock) {
            const below = ground.get(column, row + 1);
            if (below !== solidRock && below >= 0) {
              ground.set(column, row, WALL_RUN[random.int(0, WALL_RUN.length)] as string);
            } else if (random.range(0, 1) < 0.14) {
              ground.set(column, row, ROCK[random.int(0, ROCK.length)] as string);
            }
          } else if (tile === plainFloor && random.range(0, 1) < 0.18) {
            ground.set(column, row, FLOOR[random.int(0, FLOOR.length)] as string);
          }
        }
      }

      // Depth order is fixed because nobody moves, so it is decided once here
      // rather than sorted on every frame.
      const standing = floor.creatures.toSorted((a, b) => a.y - b.y);

      return {
        draw: (): void => {
          background("oklch(0.05 0.01 265)");
          camera.lookAt(map.width / 2, map.height / 2);
          map.draw();

          // The sconces, still from the world sheet so they batch with it.
          const flame = tiles.clip("torch");
          for (const torch of floor.torches) {
            image(
              flame.at(time.elapsed + torch.x * 0.17),
              map.xOf(torch.x),
              map.yOf(torch.y),
              TILE,
              TILE,
            );
          }

          // Shadows, in one fill, before anything stands on them.
          noStroke();
          fill("oklch(0.03 0.01 60 / 0.5)");
          for (const creature of standing) {
            ellipse(
              map.xOf(creature.x),
              map.yOf(creature.y) + 1,
              13 * creature.scale,
              4.5 * creature.scale,
            );
          }

          // The cast, from the other sheet, lowest last.
          for (const creature of standing) {
            const size = TILE * creature.scale;
            const bob = creature.hover === 0 ? 0 : Math.sin(time.elapsed * 6 + creature.offset) * 3;
            image(
              cast.clip(creature.clip).at(time.elapsed + creature.offset),
              map.xOf(creature.x) - size / 2,
              map.yOf(creature.y) - size - creature.hover + bob,
              size,
              size,
            );
          }

          // The light, last and additive, so it falls on everything.
          blendMode(Blend.Add);
          for (const torch of floor.torches) {
            const x = map.xOf(torch.x) + TILE / 2;
            const y = map.yOf(torch.y) + TILE / 2;
            const flicker = 1 + Math.sin(time.elapsed * 7 + torch.x) * 0.05;
            for (let ring = 0; ring < 6; ring++) {
              const spread = 1 - ring / 6;
              fill(`oklch(${0.62 + ring * 0.04} ${0.12 + ring * 0.01} ${68 - ring} / 0.055)`);
              circle(x, y, 400 * spread * spread * flicker + 32);
            }
          }
          blendMode(Blend.Normal);

          camera.screen(() => {
            fill("oklch(0.9 0.03 80 / 0.8)");
            textSize(13);
            text(
              `${floor.rooms.length} rooms · ${floor.creatures.length} creatures · 2 sheets`,
              16,
              screen.height - 18,
            );
          });
        },
      };
    },
  );
}
