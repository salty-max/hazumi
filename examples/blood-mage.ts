/**
 * A real asset pack: the Minifantasy Blood Mage.
 *
 * Six sheets, 32x32 frames, four facings per sheet arranged as two mirror
 * pairs: front-right / front-left, then back-right / back-left. Which row
 * faces which way is not in the pack metadata, so it comes from Attack_Effect:
 * the slash arc sits on the side the mage is striking, right of centre on rows
 * 0 and 2 and left of it on rows 1 and 3. Frame timing comes from the pack's
 * own AnimationInfo: 100ms for Attack, Dmg, Die and Jump, 200ms for Idle and
 * Walk — so 10fps and 5fps.
 *
 * The interesting part for the library is draw order. Each animation is its
 * own texture, and batching merges only adjacent instances, so the mages are
 * drawn grouped by the sheet they currently need rather than one at a time.
 * Interleaving would cost a draw call per mage.
 *
 * That grouping is also why nobody here is sorted by depth. A crowd can be
 * ordered by texture or by distance, not by both, and with forty of them the
 * draw calls are worth more than the handful of overlaps — which is a choice a
 * real game makes too, usually by keeping its actors on one sheet so it never
 * has to.
 *
 * The floor is a fifth sheet, laid down in one pass before any of them.
 */
import { ClipEnd, loadImage, spritesheet, type ClipOptions, type Spritesheet } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, fill, image, text, textSize } from "hazumi/draw";
import { screen, time } from "hazumi/scene";

const CELL = 32;
const SCALE = 4;
const COUNT = 40;
const TILE = 24;

const FACINGS = ["frontRight", "frontLeft", "backRight", "backLeft"] as const;
type Facing = (typeof FACINGS)[number];

/** The sheet row each facing is drawn from. Front pair first, then back. */
const FACING_ROW: Record<Facing, number> = {
  frontRight: 0,
  frontLeft: 1,
  backRight: 2,
  backLeft: 3,
};

/** Left-facing rows walk left; right-facing rows walk right. */
const WALK_X: Record<Facing, number> = {
  frontRight: 1,
  frontLeft: -1,
  backRight: 1,
  backLeft: -1,
};

type StateName = "idle" | "walk" | "attack";

interface Mage {
  x: number;
  y: number;
  facing: Facing;
  state: StateName;
  since: number;
  next: number;
  speed: number;
}

export function bloodMage(parent: HTMLElement): HazumiApp {
  return start(
    {
      // Pixel art: linear filtering would blur a 32px sprite drawn at 4x.
      backend: webgl2({ smoothing: false }),
      width: 600,
      height: 600,
      parent,
      seed: 31,
    },
    async (scene) => {
      const { random, width, height } = scene;
      const names = ["Idle", "Walk", "Attack", "Attack_Effect"] as const;
      const [images, worldImage] = await Promise.all([
        Promise.all(names.map((n) => loadImage(`/examples/assets/blood-mage/${n}.png`))),
        loadImage("/examples/assets/oryx_16bit_fantasy_world_trans.png"),
      ]);

      const stone = spritesheet(worldImage, {
        frame: [24, 24],
        margin: 24,
        frames: {
          // The brown palette rather than the blue-grey one the chamber uses.
          // Tinting the blue stone red was the first attempt and it does not
          // work: tint multiplies, so it can take light out of a colour but it
          // cannot put a hue in that the texture has none of.
          floor: [3, 3],
          floorDotted: [4, 3],
          floorCracked: [5, 3],
          floorGrate: [6, 3],
          stain: [3, 4],
        },
      });
      const slabs = ["floorDotted", "floorCracked", "floorGrate", "stain"] as const;
      const columns = Math.ceil(width / TILE) + 1;
      const rows = Math.ceil(height / TILE) + 1;
      const ground = Array.from({ length: columns * rows }, () =>
        stone.indexOf(
          random.range(0, 1) > 0.16 ? "floor" : (slabs[random.int(0, slabs.length)] as "floor"),
        ),
      );

      /** One sheet per animation, each with a clip per facing. */
      function sheetFor(
        sourceImage: (typeof images)[number],
        fps: number,
        end?: ClipEnd,
      ): Spritesheet {
        const clips: Record<string, ClipOptions> = {};
        for (const facing of FACINGS) {
          // One facing per row, whatever the sheet's length: Idle is 16 frames
          // wide and Walk is 4, and neither count is written down here.
          clips[facing] = { row: FACING_ROW[facing], fps, ...(end === undefined ? {} : { end }) };
        }
        return spritesheet(sourceImage, { frame: [CELL, CELL], clips });
      }

      const idle = sheetFor(images[0] as never, 5);
      const walk = sheetFor(images[1] as never, 5);
      const attack = sheetFor(images[2] as never, 10, ClipEnd.Hold);
      const effect = sheetFor(images[3] as never, 10, ClipEnd.Hold);

      const sheets: Record<StateName, Spritesheet> = { idle, walk, attack };

      const mages: Mage[] = Array.from({ length: COUNT }, () => ({
        x: random.range(20, width - 60),
        y: random.range(20, height - 60),
        facing: random.pick(FACINGS),
        state: "idle",
        since: 0,
        next: random.range(0.5, 3),
        speed: random.range(14, 34),
      }));

      const size = CELL * SCALE;

      return {
        draw: (): void => {
          background("oklch(0.1 0.03 25)");

          // The floor, in one pass and one texture.
          for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
              image(
                stone.frame(ground[row * columns + column] as number),
                column * TILE,
                row * TILE,
                TILE,
                TILE,
              );
            }
          }

          for (const m of mages) {
            m.since += time.delta;
            if (m.since >= m.next) {
              m.since = 0;
              m.state = random.pick(["idle", "walk", "attack"] as const);
              m.next = m.state === "attack" ? 0.6 : random.range(1, 3.5);
              if (m.state === "walk") m.facing = random.pick(FACINGS);
            }

            if (m.state === "walk") {
              m.x += WALK_X[m.facing] * m.speed * time.delta;
              if (m.x < -size) m.x = screen.width;
              if (m.x > screen.width) m.x = -size;
              m.y += Math.sin(time.elapsed * 1.3 + m.x * 0.01) * 8 * time.delta;
              m.y = Math.min(Math.max(m.y, 10), screen.height - size - 10);
            }
          }

          // One pass per sheet, so each sheet is one draw call rather than one
          // per mage. This is the whole reason the loop is shaped this way.
          for (const state of ["idle", "walk", "attack"] as const) {
            const sheet = sheets[state];
            for (const m of mages) {
              if (m.state !== state) continue;
              image(sheet.clip(m.facing).at(m.since), m.x, m.y, size, size);
            }
          }

          // Attack effects go last, over everything.
          for (const m of mages) {
            if (m.state !== "attack") continue;
            image(effect.clip(m.facing).at(m.since), m.x, m.y, size, size);
          }

          fill("oklch(0.95 0.03 30)");
          textSize(13);
          text(`${COUNT} Blood Mages · 5 sheets · grouped by animation`, 14, screen.height - 16);
        },
      };
    },
  );
}
