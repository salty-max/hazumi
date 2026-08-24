/**
 * Two spritesheets at once: a lit floor and the things walking on it.
 *
 * Tests: clips declared on the sheet, stateless sampling, and draw order.
 *
 * The character sheet declares its own animations, so the scene asks for
 * `clip('knightRun').at(t)` rather than tracking frame indices. Sampling is a
 * function of time and nothing else, which is why twenty actors can share one
 * clip without any of them advancing another's frame.
 *
 * Draw order matters here, twice over. All the floor goes down, then all the
 * shadows, then all the actors — interleaving them would cost a draw call per
 * sprite instead of one per sheet, because batching only merges adjacent
 * instances. And within the actors, the order is by depth, so the one standing
 * lower on the floor is in front, which is the whole of a two-dimensional
 * game's idea of perspective.
 */
import { ClipEnd, loadImage, spritesheet } from "hazumi/assets";
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
import { random, screen, time } from "hazumi/scene";

const TILE = 40;
const COUNT = 22;

/** The floor of the tile sheet, all of one palette. */
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

/** Who walks the floor, and how fast each of them takes it. */
const CAST = [
  { clip: "knightRun", speed: 46, scale: 2.6 },
  { clip: "knightRun", speed: 38, scale: 2.4 },
  { clip: "goblinRun", speed: 62, scale: 2.2 },
  { clip: "goblinRun", speed: 70, scale: 2 },
  { clip: "slimeCrawl", speed: 22, scale: 2.4 },
] as const;

interface Actor {
  x: number;
  y: number;
  readonly speed: number;
  readonly scale: number;
  readonly clip: (typeof CAST)[number]["clip"];
  /** Its own offset into the clip, so a crowd is not one animation. */
  readonly offset: number;
}

export function characters(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2({ smoothing: false }), width: 600, height: 600, parent, seed: 21 },
    async () => {
      const [tilesImage, spriteImage] = await Promise.all([
        loadImage("/examples/assets/dungeon-tiles.png"),
        loadImage("/examples/assets/dungeon-sprites.png"),
      ]);

      const tiles = spritesheet(tilesImage, {
        frame: [16, 16],
        frames: {
          cobble: [2, 2],
          cobbleWorn: [3, 2],
          cobbleCracked: [4, 2],
          cobbleChipped: [5, 2],
          dirt: [2, 3],
          dirtStones: [3, 3],
          dirtPebbles: [4, 3],
          dirtBare: [5, 3],
        },
      });

      const actorsSheet = spritesheet(spriteImage, {
        frame: [16, 16],
        clips: {
          knightIdle: { row: 5, from: 0, to: 5, fps: 8 },
          knightRun: { row: 6, from: 0, to: 5, fps: 12 },
          goblinRun: { row: 1, from: 0, to: 5, fps: 11 },
          slimeCrawl: { row: 4, from: 0, to: 5, fps: 7 },
          torch: { row: 3, from: 6, to: 10, fps: 10, end: ClipEnd.Loop },
        },
      });

      const columns = Math.ceil(screen.width / TILE) + 1;
      const rows = Math.ceil(screen.height / TILE) + 1;
      const ground = Array.from({ length: columns * rows }, () =>
        tiles.indexOf(FLOOR[random.int(0, FLOOR.length)] as (typeof FLOOR)[number]),
      );

      const actors: Actor[] = Array.from({ length: COUNT }, () => {
        const part = CAST[random.int(0, CAST.length)] as (typeof CAST)[number];
        return {
          x: random.range(-60, screen.width),
          y: random.range(70, screen.height - 60),
          speed: part.speed,
          scale: part.scale,
          clip: part.clip,
          offset: random.range(0, 4),
        };
      });

      // Torches on the back wall, which is also where the light comes from.
      const torches = [110, 300, 490];

      return {
        draw: (): void => {
          background("oklch(0.09 0.015 60)");

          // Pass one: the floor, from the tile sheet.
          for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
              image(
                tiles.frame(ground[row * columns + column] as number),
                column * TILE,
                row * TILE,
                TILE,
                TILE,
              );
            }
          }

          // Pass two: the light, before anything stands in it.
          noStroke();
          blendMode(Blend.Add);
          for (const x of torches) {
            for (let ring = 0; ring < 6; ring++) {
              const spread = 1 - ring / 6;
              fill(`oklch(${0.6 + ring * 0.04} ${0.12 + ring * 0.01} ${66 - ring} / 0.07)`);
              circle(x, 40, 620 * spread * spread + 40);
            }
          }
          blendMode(Blend.Normal);

          // Pass three: a shadow under each actor, all in one fill.
          fill("oklch(0.04 0.01 60 / 0.45)");
          for (const actor of actors) {
            ellipse(actor.x, actor.y + 2, 15 * actor.scale, 5 * actor.scale);
          }

          // Pass four: the actors, from the other sheet, lowest last so the
          // one nearer the viewer is the one drawn over the top.
          actors.sort((a, b) => a.y - b.y);
          for (const actor of actors) {
            actor.x += actor.speed * time.delta;
            if (actor.x > screen.width + 40) actor.x = -40;
            const frame = actorsSheet.clip(actor.clip).at(time.elapsed + actor.offset);
            const size = 16 * actor.scale;
            image(frame, actor.x - size / 2, actor.y - size, size, size);
          }

          // And the torches themselves, still from the actor sheet.
          for (const x of torches) {
            const frame = actorsSheet.clip("torch").at(time.elapsed + x * 0.01);
            image(frame, x - 20, 4, 40, 40);
          }

          fill("oklch(0.9 0.03 80 / 0.75)");
          textSize(13);
          text(
            `${columns * rows} tiles + ${COUNT} actors · 2 sheets · one batch each`,
            14,
            screen.height - 16,
          );
        },
      };
    },
  );
}
