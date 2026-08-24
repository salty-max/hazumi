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
 * Nobody walks. Each creature stands on its own tile and plays its own two
 * frames on its own phase, so the room is alive without anything pretending to
 * have somewhere to be. Everything is drawn at one tile square, creature and
 * stone alike, because a knight twice the size of the flagstone he stands on
 * is the first thing that stops a top-down scene reading as a place.
 *
 * The dark is a shader. Additive discs stacked over the frame were the first
 * attempt and they only ever add — nine rooms' worth turned the floor to
 * daylight. A light pass *multiplies* instead: unlit stone falls to a cold
 * ambient and only what a torch reaches comes back warm, which is the same
 * arithmetic a lighting model does and the reason the frame has somewhere dark
 * to be.
 *
 * The caption is in `overlay` rather than in `draw`, and that is the light's
 * doing. The composite multiplies the whole frame, so a line of text sitting in
 * an unlit corridor came out at an eighth of the brightness it was drawn with.
 * `overlay` runs after the chain has presented, which is where anything meant
 * for the reader rather than for the world belongs.
 *
 * Art: Oryx Design Lab, 16-bit fantasy. See examples/assets/CREDITS.md.
 */
import { loadImage, spritesheet, tilemap } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, ellipse, fill, image, noStroke, text, textSize } from "hazumi/draw";
import { camera, capabilities, random, screen, setPasses, time } from "hazumi/scene";

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

/**
 * Who stands in the rooms.
 *
 * No sizes: the sheets are both twenty-four pixel cells and everything is drawn
 * at one tile, so a creature occupies exactly the square it is standing on.
 */
const CAST = [
  "knight",
  "guard",
  "ranger",
  "mage",
  "goblin",
  "goblinSpear",
  "skeleton",
  "slime",
  "bat",
  "rat",
  "wolf",
] as const;

/**
 * How finely the light is worked out, per tile.
 *
 * The map is computed once and handed to the shader as a texture, so this is
 * only about how sharp a wall's shadow edge is allowed to be — four samples a
 * tile is a 100x100 image for a 25x25 floor, which the hardware then filters up
 * to the frame for free.
 */
const LIGHT_STEPS = 4;
/** How far a torch carries, in tiles. */
const REACH = 9;

/**
 * The light, computed against the map and multiplied back over the scene.
 *
 * The version before this took the light from the frame — threshold the bright
 * warm pixels, blur them wide — which is a lovely trick and cannot be made to
 * respect a wall. A glow in screen space has no idea what it is spreading
 * across; light stops at a wall because of where the wall *is*, and that is in
 * the map, not in the picture. So the map is where it is worked out: line of
 * sight from every torch to every sample, once, at load.
 *
 * The flame is still what says where a torch is. Both the sprite and the light
 * read the same list, so they cannot drift apart.
 */
const COMPOSITE = `
uniform sampler2D u_light;

void main() {
  vec3 scene = texture(u_scene, v_uv).rgb;
  vec2 lit = texture(u_light, v_uv).rg;

  // Red carries the light, green carries which torch is nearest — so each pool
  // gutters on its own phase instead of the whole floor breathing as one.
  float gutter = 0.9 + 0.1 * sin(u_time * 6.5 + lit.g * 44.0);
  float light = min(1.15, lit.r * 1.55 * gutter);

  // Cold where nothing reaches, warm where something does. The flame is well
  // off white: the stone is blue-grey, and a light that only just leans warm
  // comes back out of it grey, which is a lit room rather than a torchlit one.
  vec3 ambient = vec3(0.12, 0.14, 0.22);
  vec3 flame = vec3(1.25, 0.58, 0.18);
  float edge = 1.0 - 0.4 * pow(clamp(length(v_uv - 0.5) * 1.5, 0.0, 1.0), 2.0);

  fragColor = vec4(scene * (ambient + flame * light) * edge, 1.0);
}
`;

/** Things to leave lying about, and how often each turns up. */
const DRESSING = ["c", "C", "b", "r", "k", "h", "H", "a", "g", "G", "R", "p", "P", "t", "w", "o"];

interface Creature {
  /** Tile column and row: everything stands squarely on a square. */
  readonly x: number;
  readonly y: number;
  readonly clip: (typeof CAST)[number];
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

    // And its inhabitants, one to a tile and no two on the same one.
    const population = Math.min(4, Math.max(1, Math.floor((room.width * room.height) / 12)));
    const taken = new Set<string>();
    for (let i = 0; i < population; i++) {
      const clip = CAST[random.int(0, CAST.length)] as (typeof CAST)[number];
      const x = room.x + random.int(0, room.width);
      const y = room.y + random.int(0, room.height);
      const key = `${x},${y}`;
      if (taken.has(key)) continue;
      taken.add(key);
      creatures.push({ x, y, clip, offset: random.range(0, 4), hover: clip === "bat" ? 6 : 0 });
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

/**
 * Work the light out against the map, once, and draw it into an image.
 *
 * Line of sight is a walk along the ray from the sample to the torch, stepping
 * half a tile at a time and stopping at the first rock. It is O(samples x
 * torches x steps) and it runs exactly once: a hundred by a hundred against
 * nine torches is a few milliseconds at load, and nothing at all per frame.
 *
 * Red is how much light lands. Green names the nearest torch, so the shader can
 * gutter each pool on its own phase rather than pulsing the whole floor.
 */
function bakeLight(floor: Floor): HTMLCanvasElement {
  const width = COLUMNS * LIGHT_STEPS;
  const height = ROWS * LIGHT_STEPS;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Could not get a 2D context to bake the light into.");
  const pixels = context.createImageData(width, height);

  const solid = floor.ground.map((row) => [...row].map((cell) => cell === "#"));
  const blocked = (x: number, y: number): boolean => {
    const column = Math.floor(x);
    const row = Math.floor(y);
    if (row < 0 || row >= ROWS || column < 0 || column >= COLUMNS) return true;
    return solid[row]?.[column] === true;
  };

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      // The centre of this sample, in tiles.
      const x = (sx + 0.5) / LIGHT_STEPS;
      const y = (sy + 0.5) / LIGHT_STEPS;
      let total = 0;
      let nearest = 0;
      let best = Infinity;

      for (const [index, torch] of floor.torches.entries()) {
        const dx = torch.x + 0.5 - x;
        const dy = torch.y + 0.5 - y;
        const distance = Math.hypot(dx, dy);
        if (distance > REACH) continue;

        // Walk towards the torch, and stop testing a tile short of it. A
        // sconce sits *in* the rock of the wall it is mounted on, so a ray
        // that tested all the way to the flame would find that rock and put
        // every torch in the room out.
        const steps = Math.ceil(distance * 2);
        let clear = true;
        for (let step = 1; step < steps; step++) {
          const t = step / steps;
          if ((1 - t) * distance < 1.1) break;
          if (blocked(x + dx * t, y + dy * t)) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;

        const fall = 1 - distance / REACH;
        total += fall * fall;
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      }

      const offset = (sy * width + sx) * 4;
      pixels.data[offset] = Math.min(255, Math.round(total * 255));
      pixels.data[offset + 1] = Math.round(((nearest % 8) / 8) * 255);
      pixels.data[offset + 2] = 0;
      pixels.data[offset + 3] = 255;
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas;
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

      // Ask rather than assume. Canvas2D and the SVG exporter draw every one
      // of these tiles correctly and cannot run a shader over the result, so on
      // those the chamber is simply an unlit chamber — which is a worse picture
      // and a working scene, and better than a scene that throws.
      if (capabilities.shaders) {
        setPasses([{ fragment: COMPOSITE, textures: { u_light: bakeLight(floor) } }]);
      }

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
          fill("oklch(0.03 0.01 60 / 0.45)");
          for (const creature of standing) {
            ellipse(map.xOf(creature.x) + TILE / 2, map.yOf(creature.y) + TILE - 3, 14, 5);
          }

          // The cast, from the other sheet, lowest last. One tile square, on
          // the tile it was placed on.
          for (const creature of standing) {
            const bob = creature.hover === 0 ? 0 : Math.sin(time.elapsed * 6 + creature.offset) * 2;
            image(
              cast.clip(creature.clip).at(time.elapsed + creature.offset),
              map.xOf(creature.x),
              map.yOf(creature.y) - creature.hover + bob,
              TILE,
              TILE,
            );
          }
        },

        overlay: (): void => {
          fill("oklch(0.9 0.03 80 / 0.8)");
          textSize(13);
          text(
            `${floor.rooms.length} rooms · ${floor.creatures.length} creatures · 2 sheets`,
            16,
            screen.height - 18,
          );
        },
      };
    },
  );
}
