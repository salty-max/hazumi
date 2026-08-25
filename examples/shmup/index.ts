/**
 * A small shoot-'em-up, whole: menu, waves, pickups, a boss, death and a score.
 *
 * The point of this one is that it is a game rather than a demonstration. It
 * has a front end you have to get through, a difficulty that climbs, a reason
 * to keep moving, and an ending. Everything is pooled, so once the sheets are
 * decoded the scene allocates nothing per frame — which is the constraint an
 * action game actually puts on an engine.
 *
 * Drawing lives in ./art and the sheets in ./sprites, so the rules here read
 * the same whether a ship is a sprite or a triangle.
 */
import { createPluginHost, start, type HazumiApp } from "hazumi/app";
import { material, noMaterial } from "hazumi/draw";
import { webgl2 } from "hazumi/backends/webgl2";
import { keyIsDown, keyJustPressed, pointerJustPressed } from "hazumi/input";
import { clamp, vec2, type Vec2 } from "hazumi/math";
import { particles, type ParticleSystem } from "hazumi/particles";
import { pool, random, screen, time } from "hazumi/scene";

import {
  artwork,
  DIM,
  ENEMY,
  GOLD,
  iconWidth,
  INK,
  SHIELD,
  type ArtApi,
  type Painter,
} from "./art";
import type { PixelFont } from "./font";
import type { IconFrame } from "./sprites";

const MAX_SHOTS = 120;
const MAX_ENEMIES = 40;
const MAX_PICKUPS = 8;
const PLAYER_SPEED = 300;
/**
 * The ship is drawn thirty-four pixels across and hit on three.
 *
 * That gap is the genre rather than a fudge. An arcade shooter puts the
 * collision on the pilot, not on the hull, so a wall of fire can be threaded
 * through gaps far narrower than the sprite and a near miss reads as skill.
 * Sizing the hitbox to the artwork instead — which is what this was doing —
 * makes the same wall unsurvivable and every death feel arbitrary.
 */
const PLAYER_HIT_RADIUS = 3;
/** A bolt is hit on its centre too, for the same reason. */
const BOLT_HIT_RADIUS = 4;
/** Pickups get the opposite treatment: missing one by a pixel is no fun. */
const PICKUP_REACH = 30;
/** Half the drawn hull, which is what the playfield edge has to hold back. */
const PLAYER_HALF = 18;
const INVULNERABLE_FOR = 1.6;
/** How long an enemy stays white after a bolt lands. Two frames at 60Hz. */
const STRUCK_FOR = 0.09;
const STARTING_LIVES = 3;
const BOSS_EVERY = 6;
/** Body copy and button labels, in whole 5x7 pixels. */
const LABEL_SCALE = 2;
/**
 * The playfield is a portrait strip down the middle of a square scene.
 *
 * The gallery frames every example square, and a shmup wants to be taller
 * than it is wide — so the sides become the cabinet, which is where the score
 * and the lives live anyway.
 */
const FIELD_X = 96;
const FIELD_W = 408;
const FIELD_RIGHT = FIELD_X + FIELD_W;

type Phase = "menu" | "playing" | "over";

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hostile: boolean;
}

interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: number;
  health: number;
  cooldown: number;
  /** Its own clock, so a formation does not move in lockstep. */
  phase: number;
  boss: boolean;
  /**
   * Seconds left on the hit flash.
   *
   * A shmup has to answer "did that shot land" in the frame it lands, and the
   * spark alone does not — it appears wherever the bolt was, which on a boss
   * is nowhere near the thing you are trying to read. Whitening the sprite for
   * a twelfth of a second is the arcade's own answer.
   */
  struck: number;
}

interface Pickup {
  x: number;
  y: number;
  kind: number;
}

/** What each hull is worth, how tough it is, and how fast it comes down. */
type EnemyKind = (typeof KINDS)[number];

/**
 * The spec for a hull.
 *
 * A function rather than `KINDS[i]` at each of the four call sites: under
 * `noUncheckedIndexedAccess` that expression is `EnemyKind | undefined`, and
 * the alternative to this was the same cast written out four times. Throws,
 * because every index comes from our own spawn and a bad one is a bug rather
 * than a case to handle.
 */
function kindOf(index: number): EnemyKind {
  const spec = KINDS[index];
  if (spec === undefined) throw new RangeError(`No enemy kind ${index}`);
  return spec;
}

const KINDS = [
  { health: 1, score: 100, speed: 165, size: 30 },
  { health: 2, score: 220, speed: 105, size: 34 },
  { health: 3, score: 350, speed: 130, size: 32 },
  { health: 6, score: 700, speed: 62, size: 40 },
] as const;

/**
 * A number as large as the cabinet margin will take.
 *
 * A score climbs a digit at a time and the margin does not, so the size has to
 * give way rather than the text running out over the playfield.
 */
function fitted(font: PixelFont, value: string, x: number, y: number, color: string): void {
  const scale = font.width(value, 3) <= FIELD_X - 16 ? 3 : 2;
  font.centred(value, x, y, scale, color);
}

/** An interface tile and a label, centred together as one row. */
function iconAndText(
  art: Painter,
  name: IconFrame,
  label: string,
  x: number,
  y: number,
  color: string,
): void {
  const gap = 8;
  const tile = iconWidth(LABEL_SCALE);
  const font = art.sheets.font;
  const from = x - (tile + gap + font.width(label, LABEL_SCALE)) / 2;
  art.icon(name, from + tile / 2, y, LABEL_SCALE);
  // Six pixels lower, which is where a fourteen-pixel line sits against a
  // twenty-six-pixel tile.
  font.draw(label, from + tile + gap, y + 6, LABEL_SCALE, color);
}

export function shmup(parent: HTMLElement): HazumiApp<ArtApi> {
  return start(
    {
      backend: webgl2({ smoothing: false }),
      width: 600,
      height: 600,
      parent,
      seed: 7,
      // The art arrives on the context rather than being threaded through
      // every draw call: the plugin loads the sheets in `presetup` and hands
      // back a painter already bound to them.
      plugins: createPluginHost().use(artwork()),
    },
    ({ art }) => {
      // Three pools rather than three arrays with a `live` flag and a loop
      // that skips the dead ones. Nothing here allocates after this line.
      const shots = pool<Shot>({
        capacity: MAX_SHOTS,
        make: () => ({ x: 0, y: 0, vx: 0, vy: 0, hostile: false }),
      });
      const enemies = pool<Enemy>({
        capacity: MAX_ENEMIES,
        make: () => ({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          kind: 0,
          health: 0,
          cooldown: 0,
          phase: 0,
          boss: false,
          struck: 0,
        }),
      });
      const pickups = pool<Pickup>({
        capacity: MAX_PICKUPS,
        make: () => ({ x: 0, y: 0, kind: 0 }),
      });
      const sparks: ParticleSystem = particles({ capacity: 600 });

      let phase: Phase = "menu";
      // A Vec2 rather than two scalars: everything the ship does to itself is
      // vector work, and every other thing in the game — an enemy, a shot, a
      // pickup — already has an `x` and a `y`, so `vec2.distance(player, enemy)`
      // reads them without anything being converted.
      let player: Vec2 = { x: screen.width / 2, y: screen.height - 90 };
      let tilt = 0;
      let lives = STARTING_LIVES;
      let score = 0;
      let best = 0;
      let invulnerable = 0;
      let firing = 0;
      let spread = 0;
      let shield = 0;
      let nextWave = 0;
      let wave = 0;
      let nearSky = 0;
      let farSky = 0;

      function spawnShot(x: number, y: number, vx: number, vy: number, hostile: boolean): void {
        shots.spawn((shot) => {
          shot.x = x;
          shot.y = y;
          shot.vx = vx;
          shot.vy = vy;
          shot.hostile = hostile;
        });
      }

      function spawnEnemy(kind: number, x: number, offset: number, boss = false): void {
        const spec = kindOf(kind);
        enemies.spawn((enemy) => {
          enemy.x = x;
          enemy.y = boss ? -90 : -24;
          enemy.vx = 0;
          enemy.vy = boss ? 40 : spec.speed;
          enemy.kind = kind;
          enemy.health = boss ? 60 + wave * 6 : spec.health;
          enemy.cooldown = random.range(0.6, 2.2);
          enemy.phase = offset;
          enemy.boss = boss;
          enemy.struck = 0;
        });
      }

      function burst(x: number, y: number, count: number, colour: string): void {
        sparks.emit({
          count,
          x,
          y,
          speed: [50, 280],
          angle: [0, Math.PI * 2],
          life: [0.25, 0.75],
          size: [2, 6],
          color: colour,
        });
      }

      /** Waves get denser and tougher, with something bigger every sixth. */
      function launchWave(): void {
        wave++;
        if (wave % BOSS_EVERY === 0) {
          spawnEnemy(3, FIELD_X + FIELD_W / 2, 0, true);
          nextWave = 14;
          return;
        }
        const hardness = Math.min(wave, 12);
        const pattern = wave % 3;
        if (pattern === 0) {
          const count = 4 + Math.floor(hardness / 3);
          for (let i = 0; i < count; i++) {
            spawnEnemy(0, FIELD_X + ((i + 1) * FIELD_W) / (count + 1), i * 0.35);
          }
        } else if (pattern === 1) {
          const count = 2 + Math.floor(hardness / 4);
          for (let i = 0; i < count; i++) {
            spawnEnemy(1, FIELD_X + ((i + 1) * FIELD_W) / (count + 1), i * 0.9);
          }
        } else {
          spawnEnemy(2, FIELD_X + FIELD_W * 0.28, 0);
          spawnEnemy(2, FIELD_X + FIELD_W * 0.72, 0.6);
          if (hardness > 6) spawnEnemy(3, FIELD_X + FIELD_W / 2, 0);
        }
        nextWave = Math.max(1.2, 2.8 - hardness * 0.13);
      }

      function reset(): void {
        shots.clear();
        enemies.clear();
        pickups.clear();
        sparks.clear();
        player = { x: FIELD_X + FIELD_W / 2, y: screen.height - 80 };
        lives = STARTING_LIVES;
        score = 0;
        invulnerable = INVULNERABLE_FOR;
        spread = 0;
        shield = 0;
        wave = 0;
        nextWave = 0.9;
        firing = 0;
      }

      function hitPlayer(): void {
        if (invulnerable > 0) return;
        if (shield > 0) {
          shield = 0;
          invulnerable = INVULNERABLE_FOR * 0.6;
          burst(player.x, player.y, 26, SHIELD);
          return;
        }
        lives--;
        burst(player.x, player.y, 46, GOLD);
        invulnerable = INVULNERABLE_FOR;
        spread = 0;
        if (lives <= 0) {
          phase = "over";
          best = Math.max(best, score);
        }
      }

      return {
        update(dt: number): void {
          // The sky keeps moving behind the menu: a still background reads as
          // a screenshot rather than a game waiting for you.
          nearSky += 150 * dt;
          farSky += 44 * dt;
          sparks.update(dt);

          if (phase !== "playing") {
            if (keyJustPressed(" ") || keyJustPressed("Enter") || pointerJustPressed()) {
              reset();
              phase = "playing";
            }
            return;
          }

          invulnerable = Math.max(0, invulnerable - dt);
          const left = keyIsDown("ArrowLeft") || keyIsDown("a");
          const right = keyIsDown("ArrowRight") || keyIsDown("d");
          const up = keyIsDown("ArrowUp") || keyIsDown("w");
          const down = keyIsDown("ArrowDown") || keyIsDown("s");
          const dx = (right ? 1 : 0) - (left ? 1 : 0);
          const dy = (down ? 1 : 0) - (up ? 1 : 0);
          // Normalized, so a diagonal is not faster than a straight line, and
          // `normalize` already answers the standing-still case with the zero
          // vector — which is the guard the hand-written version bolted on.
          const heading = vec2.normalize({ x: dx, y: dy });
          player = vec2.addScaled(player, heading, PLAYER_SPEED * dt);
          player = {
            x: clamp(player.x, FIELD_X + PLAYER_HALF, FIELD_RIGHT - PLAYER_HALF),
            y: clamp(player.y, 60, screen.height - 26),
          };
          tilt += (dx - tilt) * Math.min(1, dt * 12);

          firing -= dt;
          if ((keyIsDown(" ") || keyIsDown("z")) && firing <= 0) {
            firing = spread > 0 ? 0.1 : 0.15;
            spawnShot(player.x, player.y - 18, 0, -600, false);
            if (spread > 0) {
              spawnShot(player.x - 9, player.y - 12, -170, -540, false);
              spawnShot(player.x + 9, player.y - 12, 170, -540, false);
            }
          }
          spread = Math.max(0, spread - dt);

          nextWave -= dt;
          if (nextWave <= 0) launchWave();

          enemies.forEach((enemy) => {
            enemy.phase += dt;
            enemy.struck = Math.max(0, enemy.struck - dt);
            const spec = kindOf(enemy.kind);

            if (enemy.boss) {
              // Holds station near the top and sweeps, so the fight is about
              // dodging rather than chasing.
              if (enemy.y < 130) enemy.y += enemy.vy * dt;
              enemy.x = FIELD_X + FIELD_W / 2 + Math.sin(enemy.phase * 0.7) * (FIELD_W / 2 - 60);
            } else {
              if (enemy.kind === 1) enemy.x += Math.cos(enemy.phase * 2.2) * 120 * dt;
              if (enemy.kind === 0 && enemy.phase > 0.7) {
                if (enemy.vx === 0) {
                  const toX = player.x - enemy.x;
                  enemy.vx = Math.sign(toX) * Math.min(Math.abs(toX) * 1.5, 150);
                }
                enemy.x += enemy.vx * dt;
              }
              enemy.y += enemy.vy * dt;
            }

            enemy.cooldown -= dt;
            const canFire = enemy.y > 0 && (enemy.boss || enemy.y < screen.height - 150);
            if (enemy.cooldown <= 0 && canFire) {
              enemy.cooldown = enemy.boss ? 0.45 : random.range(1.1, 2.6);
              const aim = vec2.heading(vec2.sub(player, enemy));
              const speed = enemy.boss ? 250 : 270;
              spawnShot(enemy.x, enemy.y + 14, Math.cos(aim) * speed, Math.sin(aim) * speed, true);
              if (enemy.boss) {
                spawnShot(
                  enemy.x - 26,
                  enemy.y + 10,
                  Math.cos(aim - 0.3) * speed,
                  Math.sin(aim - 0.3) * speed,
                  true,
                );
                spawnShot(
                  enemy.x + 26,
                  enemy.y + 10,
                  Math.cos(aim + 0.3) * speed,
                  Math.sin(aim + 0.3) * speed,
                  true,
                );
              }
            }

            if (!enemy.boss && enemy.y > screen.height + 40) enemies.kill(enemy);

            const reach = (enemy.boss ? 54 : spec.size * 0.42) + PLAYER_HIT_RADIUS;
            if (vec2.distance(enemy, player) < reach) {
              if (!enemy.boss) {
                enemies.kill(enemy);
                burst(enemy.x, enemy.y, 24, ENEMY);
              }
              hitPlayer();
            }
          });

          shots.forEach((shot) => {
            shot.x += shot.vx * dt;
            shot.y += shot.vy * dt;
            if (
              shot.y < -24 ||
              shot.y > screen.height + 24 ||
              shot.x < -24 ||
              shot.x > screen.width + 24
            ) {
              shots.kill(shot);
              return;
            }
            if (shot.hostile) {
              if (vec2.distance(shot, player) < PLAYER_HIT_RADIUS + BOLT_HIT_RADIUS) {
                shots.kill(shot);
                hitPlayer();
              }
              return;
            }
            // A bolt is spent on the first hull it reaches. `forEach` has no
            // `break`, so the flag is what stops it hitting the rank behind.
            let spent = false;
            enemies.forEach((enemy) => {
              if (spent) return;
              const spec = kindOf(enemy.kind);
              const radius = enemy.boss ? 46 : spec.size * 0.45;
              if (vec2.distance(shot, enemy) > radius) return;
              spent = true;
              shots.kill(shot);
              enemy.health--;
              enemy.struck = STRUCK_FOR;
              burst(shot.x, shot.y, 5, GOLD);
              if (enemy.health > 0) return;
              enemies.kill(enemy);
              score += enemy.boss ? 5000 : spec.score;
              burst(enemy.x, enemy.y, enemy.boss ? 90 : 28, ENEMY);
              if (enemy.boss || random.range(0, 1) < 0.15) {
                pickups.spawn((pickup) => {
                  pickup.x = enemy.x;
                  pickup.y = enemy.y;
                  pickup.kind = random.bool() ? 0 : 1;
                });
              }
            });
          });

          pickups.forEach((pickup) => {
            pickup.y += 95 * dt;
            if (pickup.y > screen.height + 20) {
              pickups.kill(pickup);
              return;
            }
            if (vec2.distance(pickup, player) < PICKUP_REACH) {
              pickups.kill(pickup);
              if (pickup.kind === 0) spread = 14;
              else shield = 1;
              burst(pickup.x, pickup.y, 16, pickup.kind === 0 ? GOLD : SHIELD);
              score += 50;
            }
          });
        },

        draw(): void {
          art.sky(nearSky, farSky);

          if (phase !== "menu") {
            pickups.forEach((pickup) => {
              art.pickup(pickup.x, pickup.y, pickup.kind, time.elapsed * 2);
            });
            enemies.forEach((enemy) => {
              const spec = kindOf(enemy.kind);
              // Fading rather than a hard on/off: at one frame it reads as a
              // dropped frame, and the sprite is only white at the moment of
              // contact anyway. Costs nothing extra — a flashing enemy and a
              // plain one are still the same draw call.
              if (enemy.struck > 0) {
                material({ type: "flash", amount: enemy.struck / STRUCK_FOR });
              }
              if (enemy.boss) art.boss(enemy.x, enemy.y, Math.sin(enemy.phase * 2));
              else art.enemy(enemy.x, enemy.y, enemy.kind, spec.size);
              noMaterial();
            });
            shots.forEach((shot) => {
              art.shot(shot.x, shot.y, shot.hostile);
            });
            // Blink while invulnerable, the way every arcade ship has.
            const hidden = invulnerable > 0 && Math.floor(invulnerable * 12) % 2 === 0;
            if (phase === "playing" && !hidden) {
              art.player(player.x, player.y, tilt);
              art.core(
                player.x,
                player.y,
                PLAYER_HIT_RADIUS,
                Math.sin(time.elapsed * 7) * 0.5 + 0.5,
              );
            }
          }
          sparks.draw();

          // The cabinet: everything outside the strip is furniture, drawn over
          // the sky so ships that stray look like they went behind it.
          art.sides(FIELD_X, FIELD_RIGHT);

          if (phase !== "menu") {
            const left = FIELD_X / 2;
            const right = FIELD_RIGHT + FIELD_X / 2;
            art.sheets.font.centred("SCORE", left, 56, 2, DIM);
            fitted(art.sheets.font, `${score}`, left, 74, GOLD);
            art.sheets.font.centred("WAVE", left, 126, 2, DIM);
            fitted(art.sheets.font, `${wave}`, left, 144, INK);
            art.sheets.font.centred("SHIPS", left, 198, 2, DIM);
            for (let i = 0; i < lives; i++) art.player(left, 236 + i * 38, 0);

            if (spread > 0) art.sheets.font.centred("SPREAD", right, 74, 2, GOLD);
            if (shield > 0) art.sheets.font.centred("SHIELD", right, 98, 2, SHIELD);
          }

          const middle = screen.width / 2;
          const blink = Math.floor(time.elapsed * 2) % 2 === 0;

          if (phase === "menu") {
            art.sheets.panel.draw(FIELD_X + 12, 150, FIELD_W - 24, 268);
            art.sheets.font.centred("STARFALL", middle, 186, 6, GOLD);

            // The stick is spelled with the sheet's own arrows: it is the one
            // instruction that reads faster as a picture than as the word.
            const step = 28;
            art.icon("left", middle - step * 1.5, 244, 2);
            art.icon("up", middle - step * 0.5, 244, 2);
            art.icon("down", middle + step * 0.5, 244, 2);
            art.icon("right", middle + step * 1.5, 244, 2);
            art.sheets.font.centred("OR WASD TO FLY", middle, 282, 2, DIM);
            art.sheets.font.centred("SPACE TO FIRE", middle, 304, 2, DIM);
            art.sheets.font.centred("GRAB SPREAD AND SHIELDS", middle, 326, 2, DIM);
            art.sheets.font.centred("A BOSS EVERY SIXTH WAVE", middle, 348, 2, DIM);

            if (blink) iconAndText(art, "play", "PRESS SPACE", middle, 378, GOLD);
          }

          if (phase === "over") {
            art.sheets.panel.draw(FIELD_X + 12, 190, FIELD_W - 24, 210);
            art.sheets.font.centred("GAME OVER", middle, 226, 5, ENEMY);
            art.sheets.font.centred(`SCORE ${score}`, middle, 286, 3, INK);
            iconAndText(art, "trophy", `BEST ${Math.max(best, score)}`, middle, 322, GOLD);
            if (blink) art.sheets.font.centred("SPACE TO TRY AGAIN", middle, 364, 2, DIM);
          }
        },
      };
    },
  );
}
