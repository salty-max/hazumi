/**
 * A real asset pack: the Minifantasy Blood Mage.
 *
 * Six sheets, 32x32 frames, four facings per sheet arranged as two mirror
 * pairs. Frame timing comes from the pack's own AnimationInfo: 100ms for
 * Attack, Dmg, Die and Jump, 200ms for Idle and Walk — so 10fps and 5fps.
 *
 * The interesting part for the library is draw order. Each animation is its
 * own texture, and batching merges only adjacent instances, so the mages are
 * drawn grouped by the sheet they currently need rather than one at a time.
 * Interleaving would cost a draw call per mage.
 */
import {
  ClipEnd,
  start,
  spritesheet,
  type MatterApp,
  type MatterContext,
  type Spritesheet,
} from "matter";
import { webgl2 } from "matter/backends/webgl2";

const CELL = 32;
const SCALE = 4;
const COUNT = 24;

/** Names are by index: the pack does not say which row is which compass point. */
const FACINGS = 4;

type StateName = "idle" | "walk" | "attack";

interface Mage {
  x: number;
  y: number;
  facing: number;
  state: StateName;
  since: number;
  next: number;
  speed: number;
}

/** Linear frame indices for one row of a sheet. */
function rowFrames(columns: number, row: number): number[] {
  return Array.from({ length: columns }, (_, i) => row * columns + i);
}

export function bloodMage(parent: HTMLElement): MatterApp {
  return start(
    {
      // Pixel art: linear filtering would blur a 32px sprite drawn at 4x.
      backend: webgl2({ smoothing: false }),
      width: 600,
      height: 600,
      parent,
      seed: 31,
    },
    async (s) => {
      const names = ["Idle", "Walk", "Attack", "Attack_Effect"] as const;
      const images = await Promise.all(
        names.map((n) => s.loadImage(`/examples/assets/blood-mage/${n}.png`)),
      );

      /** One sheet per animation, each with a clip per facing. */
      function sheetFor(image: (typeof images)[number], fps: number, end?: ClipEnd): Spritesheet {
        const columns = Math.floor(image.width / CELL);
        const clips: Record<string, { frames: number[]; fps: number; end?: ClipEnd }> = {};
        for (let facing = 0; facing < FACINGS; facing++) {
          clips[`f${facing}`] = {
            frames: rowFrames(columns, facing),
            fps,
            ...(end === undefined ? {} : { end }),
          };
        }
        return spritesheet(image, { frame: [CELL, CELL], clips });
      }

      const idle = sheetFor(images[0] as never, 5);
      const walk = sheetFor(images[1] as never, 5);
      const attack = sheetFor(images[2] as never, 10, ClipEnd.Hold);
      const effect = sheetFor(images[3] as never, 10, ClipEnd.Hold);

      const sheets: Record<StateName, Spritesheet> = { idle, walk, attack };

      const mages: Mage[] = Array.from({ length: COUNT }, () => ({
        x: s.random.range(20, s.width - 60),
        y: s.random.range(20, s.height - 60),
        facing: s.random.int(0, FACINGS),
        state: "idle",
        since: 0,
        next: s.random.range(0.5, 3),
        speed: s.random.range(14, 34),
      }));

      const size = CELL * SCALE;

      return {
        draw: (
          _alpha,
          { background, image, text, textSize, fill, width, height, t, dt }: MatterContext,
        ): void => {
          background("oklch(0.14 0.03 20)");

          for (const m of mages) {
            m.since += dt;
            if (m.since >= m.next) {
              m.since = 0;
              m.state = s.random.pick(["idle", "walk", "attack"] as const);
              m.next = m.state === "attack" ? 0.6 : s.random.range(1, 3.5);
              if (m.state === "walk") m.facing = s.random.int(0, FACINGS);
            }

            if (m.state === "walk") {
              // Facings are two mirror pairs, so even rows read as one direction
              // and odd rows as its mirror.
              const dir = m.facing % 2 === 0 ? 1 : -1;
              m.x += dir * m.speed * dt;
              if (m.x < -size) m.x = width;
              if (m.x > width) m.x = -size;
              m.y += Math.sin(t * 1.3 + m.x * 0.01) * 8 * dt;
              m.y = Math.min(Math.max(m.y, 10), height - size - 10);
            }
          }

          // One pass per sheet, so each sheet is one draw call rather than one
          // per mage. This is the whole reason the loop is shaped this way.
          for (const state of ["idle", "walk", "attack"] as const) {
            const sheet = sheets[state];
            for (const m of mages) {
              if (m.state !== state) continue;
              image(sheet.clip(`f${m.facing}`).at(m.since), m.x, m.y, size, size);
            }
          }

          // Attack effects go last, over everything.
          for (const m of mages) {
            if (m.state !== "attack") continue;
            image(effect.clip(`f${m.facing}`).at(m.since), m.x, m.y, size, size);
          }

          fill("oklch(0.95 0.03 30)");
          textSize(13);
          text(`${COUNT} Blood Mages · 4 sheets · grouped by animation`, 14, height - 16);
        },
      };
    },
  );
}
