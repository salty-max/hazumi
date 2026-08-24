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
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { Align, fill, text, textAlign, textSize } from "hazumi/draw";
import { keyIsDown, keyJustPressed, pointerJustPressed } from "hazumi/input";
import { particles, type ParticleSystem } from "hazumi/particles";
import { random, screen, time } from "hazumi/scene";

import {
  centred,
  DIM,
  drawBoss,
  drawEnemy,
  drawPickup,
  drawPlayer,
  drawShot,
  drawSides,
  drawSky,
  ENEMY,
  GOLD,
  icon,
  INK,
  panel,
  SHIELD,
} from "./art";
import { loadArt } from "./sprites";

const MAX_SHOTS = 120;
const MAX_ENEMIES = 40;
const MAX_PICKUPS = 8;
const PLAYER_SPEED = 300;
const PLAYER_RADIUS = 12;
const INVULNERABLE_FOR = 1.6;
const STARTING_LIVES = 3;
const BOSS_EVERY = 6;
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
  live: boolean;
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
  live: boolean;
}

interface Pickup {
  x: number;
  y: number;
  kind: number;
  live: boolean;
}

/** What each hull is worth, how tough it is, and how fast it comes down. */
const KINDS = [
  { health: 1, score: 100, speed: 165, size: 30 },
  { health: 2, score: 220, speed: 105, size: 34 },
  { health: 3, score: 350, speed: 130, size: 32 },
  { health: 6, score: 700, speed: 62, size: 40 },
] as const;

export function shmup(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2({ smoothing: false }), width: 600, height: 600, parent, seed: 7 },
    async () => {
      const art = await loadArt();

      const shots: Shot[] = [];
      for (let i = 0; i < MAX_SHOTS; i++) {
        shots.push({ x: 0, y: 0, vx: 0, vy: 0, hostile: false, live: false });
      }
      const enemies: Enemy[] = [];
      for (let i = 0; i < MAX_ENEMIES; i++) {
        enemies.push({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          kind: 0,
          health: 0,
          cooldown: 0,
          phase: 0,
          boss: false,
          live: false,
        });
      }
      const pickups: Pickup[] = [];
      for (let i = 0; i < MAX_PICKUPS; i++) pickups.push({ x: 0, y: 0, kind: 0, live: false });
      const sparks: ParticleSystem = particles({ capacity: 600 });

      let phase: Phase = "menu";
      let playerX = screen.width / 2;
      let playerY = screen.height - 90;
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
        for (const shot of shots) {
          if (shot.live) continue;
          shot.x = x;
          shot.y = y;
          shot.vx = vx;
          shot.vy = vy;
          shot.hostile = hostile;
          shot.live = true;
          return;
        }
      }

      function spawnEnemy(kind: number, x: number, offset: number, boss = false): void {
        for (const enemy of enemies) {
          if (enemy.live) continue;
          const spec = KINDS[kind] as (typeof KINDS)[number];
          enemy.x = x;
          enemy.y = boss ? -90 : -24;
          enemy.vx = 0;
          enemy.vy = boss ? 40 : spec.speed;
          enemy.kind = kind;
          enemy.health = boss ? 60 + wave * 6 : spec.health;
          enemy.cooldown = random.range(0.6, 2.2);
          enemy.phase = offset;
          enemy.boss = boss;
          enemy.live = true;
          return;
        }
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
        for (const shot of shots) shot.live = false;
        for (const enemy of enemies) enemy.live = false;
        for (const pickup of pickups) pickup.live = false;
        sparks.clear();
        playerX = FIELD_X + FIELD_W / 2;
        playerY = screen.height - 80;
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
          burst(playerX, playerY, 26, SHIELD);
          return;
        }
        lives--;
        burst(playerX, playerY, 46, GOLD);
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
          const length = Math.hypot(dx, dy) || 1;
          playerX += (dx / length) * PLAYER_SPEED * dt;
          playerY += (dy / length) * PLAYER_SPEED * dt;
          playerX = Math.min(Math.max(playerX, FIELD_X + 20), FIELD_RIGHT - 20);
          playerY = Math.min(Math.max(playerY, 60), screen.height - 26);
          tilt += (dx - tilt) * Math.min(1, dt * 12);

          firing -= dt;
          if ((keyIsDown(" ") || keyIsDown("z")) && firing <= 0) {
            firing = spread > 0 ? 0.1 : 0.15;
            spawnShot(playerX, playerY - 18, 0, -600, false);
            if (spread > 0) {
              spawnShot(playerX - 9, playerY - 12, -170, -540, false);
              spawnShot(playerX + 9, playerY - 12, 170, -540, false);
            }
          }
          spread = Math.max(0, spread - dt);

          nextWave -= dt;
          if (nextWave <= 0) launchWave();

          for (const enemy of enemies) {
            if (!enemy.live) continue;
            enemy.phase += dt;
            const spec = KINDS[enemy.kind] as (typeof KINDS)[number];

            if (enemy.boss) {
              // Holds station near the top and sweeps, so the fight is about
              // dodging rather than chasing.
              if (enemy.y < 130) enemy.y += enemy.vy * dt;
              enemy.x = FIELD_X + FIELD_W / 2 + Math.sin(enemy.phase * 0.7) * (FIELD_W / 2 - 60);
            } else {
              if (enemy.kind === 1) enemy.x += Math.cos(enemy.phase * 2.2) * 120 * dt;
              if (enemy.kind === 0 && enemy.phase > 0.7) {
                if (enemy.vx === 0) {
                  const toX = playerX - enemy.x;
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
              const aim = Math.atan2(playerY - enemy.y, playerX - enemy.x);
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

            if (!enemy.boss && enemy.y > screen.height + 40) enemy.live = false;

            const reach = (enemy.boss ? 54 : spec.size * 0.42) + PLAYER_RADIUS;
            if (Math.hypot(enemy.x - playerX, enemy.y - playerY) < reach) {
              if (!enemy.boss) {
                enemy.live = false;
                burst(enemy.x, enemy.y, 24, ENEMY);
              }
              hitPlayer();
            }
          }

          for (const shot of shots) {
            if (!shot.live) continue;
            shot.x += shot.vx * dt;
            shot.y += shot.vy * dt;
            if (
              shot.y < -24 ||
              shot.y > screen.height + 24 ||
              shot.x < -24 ||
              shot.x > screen.width + 24
            ) {
              shot.live = false;
              continue;
            }
            if (shot.hostile) {
              if (Math.hypot(shot.x - playerX, shot.y - playerY) < PLAYER_RADIUS + 5) {
                shot.live = false;
                hitPlayer();
              }
              continue;
            }
            for (const enemy of enemies) {
              if (!enemy.live) continue;
              const spec = KINDS[enemy.kind] as (typeof KINDS)[number];
              const radius = enemy.boss ? 46 : spec.size * 0.45;
              if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) > radius) continue;
              shot.live = false;
              enemy.health--;
              burst(shot.x, shot.y, 5, GOLD);
              if (enemy.health <= 0) {
                enemy.live = false;
                score += enemy.boss ? 5000 : spec.score;
                burst(enemy.x, enemy.y, enemy.boss ? 90 : 28, ENEMY);
                if (enemy.boss || random.range(0, 1) < 0.15) {
                  for (const pickup of pickups) {
                    if (pickup.live) continue;
                    pickup.x = enemy.x;
                    pickup.y = enemy.y;
                    pickup.kind = random.bool() ? 0 : 1;
                    pickup.live = true;
                    break;
                  }
                }
              }
              break;
            }
          }

          for (const pickup of pickups) {
            if (!pickup.live) continue;
            pickup.y += 95 * dt;
            if (pickup.y > screen.height + 20) {
              pickup.live = false;
              continue;
            }
            if (Math.hypot(pickup.x - playerX, pickup.y - playerY) < PLAYER_RADIUS + 14) {
              pickup.live = false;
              if (pickup.kind === 0) spread = 14;
              else shield = 1;
              burst(pickup.x, pickup.y, 16, pickup.kind === 0 ? GOLD : SHIELD);
              score += 50;
            }
          }
        },

        draw(): void {
          drawSky(art, nearSky, farSky);

          if (phase !== "menu") {
            for (const pickup of pickups) {
              if (pickup.live) drawPickup(art, pickup.x, pickup.y, pickup.kind, time.elapsed * 2);
            }
            for (const enemy of enemies) {
              if (!enemy.live) continue;
              const spec = KINDS[enemy.kind] as (typeof KINDS)[number];
              if (enemy.boss) drawBoss(art, enemy.x, enemy.y, Math.sin(enemy.phase * 2));
              else drawEnemy(art, enemy.x, enemy.y, enemy.kind, spec.size);
            }
            for (const shot of shots) {
              if (shot.live) drawShot(art, shot.x, shot.y, shot.hostile);
            }
            // Blink while invulnerable, the way every arcade ship has.
            const hidden = invulnerable > 0 && Math.floor(invulnerable * 12) % 2 === 0;
            if (phase === "playing" && !hidden) drawPlayer(art, playerX, playerY, tilt);
          }
          sparks.draw();

          // The cabinet: everything outside the strip is furniture, drawn over
          // the sky so ships that stray look like they went behind it.
          drawSides(art, FIELD_X, FIELD_RIGHT);

          if (phase !== "menu") {
            fill(INK);
            textSize(13);
            textAlign(Align.Center);
            text("SCORE", FIELD_X / 2, 60);
            textSize(20);
            text(`${score}`, FIELD_X / 2, 84);
            textSize(13);
            text("WAVE", FIELD_X / 2, 130);
            textSize(20);
            text(`${wave}`, FIELD_X / 2, 154);
            textSize(13);
            text("SHIPS", FIELD_X / 2, 210);
            textAlign(Align.Left);
            for (let i = 0; i < lives; i++) drawPlayer(art, FIELD_X / 2, 244 + i * 34, 0);

            textAlign(Align.Center);
            if (spread > 0) {
              fill(GOLD);
              textSize(12);
              text("SPREAD", FIELD_RIGHT + FIELD_X / 2, 84);
            }
            if (shield > 0) {
              fill(SHIELD);
              textSize(12);
              text("SHIELD", FIELD_RIGHT + FIELD_X / 2, 110);
            }
            textAlign(Align.Left);
          }

          if (phase === "menu") {
            panel(art, FIELD_X + 12, 150, FIELD_W - 24, 250);
            centred("STARFALL", 216, 38);
            centred("arrows or WASD to fly", 262, 13, DIM);
            centred("space to fire", 282, 13, DIM);
            centred("pick up spread and shields", 302, 13, DIM);
            centred("a bigger one every sixth wave", 322, 13, DIM);
            icon(art, "play", screen.width / 2 - 16, 340, 32);
            centred(
              Math.floor(time.elapsed * 2) % 2 === 0 ? "press space to begin" : " ",
              392,
              15,
              GOLD,
            );
          }

          if (phase === "over") {
            panel(art, FIELD_X + 12, 190, FIELD_W - 24, 200);
            centred("YOU DIED", 250, 32, ENEMY);
            centred(`score ${score}`, 292, 16);
            centred(`best ${Math.max(best, score)}`, 318, 14, DIM);
            centred(
              Math.floor(time.elapsed * 2) % 2 === 0 ? "space to try again" : " ",
              364,
              15,
              GOLD,
            );
          }
        },
      };
    },
  );
}
