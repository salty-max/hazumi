/**
 * Two spritesheets at once: a lit floor, and everything walking on it.
 *
 * Tests: clips declared by name, stateless sampling, and draw order.
 *
 * The character sheet declares its own animations, so the scene asks for
 * `clip('goblin').at(t)` rather than tracking frame indices. Sampling is a
 * function of time and nothing else, which is why two dozen actors share
 * eleven clips without any of them advancing another's frame.
 *
 * Draw order matters twice over. All the floor goes down, then the light, then
 * the shadows, then the actors — interleaving the two sheets would cost a draw
 * call per sprite instead of one per sheet, because batching only merges
 * adjacent instances. And within the actors the order is by depth, so whoever
 * stands lower on the floor is drawn in front, which is the whole of a
 * two-dimensional game's idea of perspective.
 *
 * Art: Oryx Design Lab, 16-bit fantasy. Every creature is two frames, one
 * directly under the other, so a clip is a pair of names.
 */
import { loadImage, spritesheet } from "hazumi/assets";
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

const TILE = 24;
const COUNT = 26;

/** Floor slabs, from the same palette the chamber scene uses. */
const FLOOR = ["floor", "floorInset", "floorCracked", "floorArc"] as const;

/** Who walks the floor: a clip, how fast it takes it, and how big it is. */
const CAST = [
  { clip: "knight", speed: 34, scale: 2 },
  { clip: "guard", speed: 30, scale: 2 },
  { clip: "ranger", speed: 44, scale: 1.9 },
  { clip: "mage", speed: 26, scale: 1.9 },
  { clip: "goblin", speed: 58, scale: 1.7 },
  { clip: "goblinSpear", speed: 52, scale: 1.7 },
  { clip: "skeleton", speed: 40, scale: 1.8 },
  { clip: "slime", speed: 18, scale: 1.6 },
  { clip: "bat", speed: 76, scale: 1.4 },
  { clip: "rat", speed: 66, scale: 1.3 },
  { clip: "wolf", speed: 62, scale: 1.8 },
] as const;

interface Actor {
  x: number;
  y: number;
  readonly speed: number;
  readonly scale: number;
  readonly clip: (typeof CAST)[number]["clip"];
  /** Its own offset into the clip, so a crowd is not one animation. */
  readonly offset: number;
  /** Bats and the like do not walk on the floor. */
  readonly hover: number;
}

export function characters(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2({ smoothing: false }), width: 600, height: 600, parent, seed: 21 },
    async () => {
      const [worldImage, creatureImage] = await Promise.all([
        loadImage("/examples/assets/oryx_16bit_fantasy_world_trans.png"),
        loadImage("/examples/assets/oryx_16bit_fantasy_creatures_trans.png"),
      ]);

      const tiles = spritesheet(worldImage, {
        frame: [24, 24],
        margin: 24,
        frames: {
          floor: [3, 7],
          floorInset: [4, 7],
          floorCracked: [5, 7],
          floorArc: [6, 7],
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

      const columns = Math.ceil(screen.width / TILE) + 1;
      const rows = Math.ceil(screen.height / TILE) + 1;
      const ground = Array.from({ length: columns * rows }, () =>
        tiles.indexOf(
          random.range(0, 1) > 0.22
            ? "floor"
            : (FLOOR[random.int(0, FLOOR.length)] as (typeof FLOOR)[number]),
        ),
      );

      const actors: Actor[] = Array.from({ length: COUNT }, () => {
        const part = CAST[random.int(0, CAST.length)] as (typeof CAST)[number];
        return {
          x: random.range(-60, screen.width),
          y: random.range(90, screen.height - 50),
          speed: part.speed,
          scale: part.scale,
          clip: part.clip,
          offset: random.range(0, 4),
          hover: part.clip === "bat" ? 26 : 0,
        };
      });

      /** Sconces along the back wall, which is where the light comes from. */
      const torches = [76, 226, 376, 526];

      return {
        draw: (): void => {
          background("oklch(0.07 0.015 265)");

          // Pass one: the floor, from the world sheet.
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

          // The sconces, still from the world sheet, so they batch with it.
          const flame = tiles.clip("torch");
          for (const x of torches) {
            image(flame.at(time.elapsed + x * 0.01), x - 16, 8, 32, 32);
          }

          // Pass two: the light they throw, before anything stands in it.
          noStroke();
          blendMode(Blend.Add);
          for (const x of torches) {
            for (let ring = 0; ring < 6; ring++) {
              const spread = 1 - ring / 6;
              fill(`oklch(${0.6 + ring * 0.04} ${0.11 + ring * 0.01} ${68 - ring} / 0.06)`);
              circle(x, 30, 640 * spread * spread + 40);
            }
          }
          blendMode(Blend.Normal);

          // Pass three: a shadow under each actor, all in one fill.
          fill("oklch(0.04 0.01 60 / 0.5)");
          for (const actor of actors) {
            ellipse(actor.x, actor.y + 1, 13 * actor.scale, 4.5 * actor.scale);
          }

          // Pass four: the actors, from the other sheet, lowest last.
          actors.sort((a, b) => a.y - b.y);
          for (const actor of actors) {
            actor.x += actor.speed * time.delta;
            if (actor.x > screen.width + 50) actor.x = -50;
            const frame = cast.clip(actor.clip).at(time.elapsed + actor.offset);
            const size = TILE * actor.scale;
            const bob = actor.hover === 0 ? 0 : Math.sin(time.elapsed * 6 + actor.offset) * 4;
            image(frame, actor.x - size / 2, actor.y - size - actor.hover + bob, size, size);
          }

          fill("oklch(0.9 0.03 80 / 0.8)");
          textSize(13);
          text(
            `${columns * rows} tiles + ${COUNT} actors · 2 sheets · ${CAST.length} clips`,
            14,
            screen.height - 16,
          );
        },
      };
    },
  );
}
