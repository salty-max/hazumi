/**
 * Wolfenstein-style DDA on the 2D command buffer.
 *
 * One image-region strip per column (the image pipeline's batch), distance
 * fog as a per-instance tint rather than a second shape pass, billboard
 * sprites occluded by a z-buffer, async asset loading, and input. Not a 3D
 * API — walls are 1px-wide crops of a tile.
 */
import { loadImage, spritesheet, type AnimationClip, type SpriteFrame } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  background,
  circle,
  fill,
  image,
  line,
  noStroke,
  noTint,
  rect,
  stroke,
  strokeWeight,
  text,
  textSize,
  tint,
} from "hazumi/draw";
import { input, keyIsDown } from "hazumi/input";
import { camera, screen, time } from "hazumi/scene";

const MOVE = 3.2;
const TURN = 2.2;
const RADIUS = 0.18;
const FOG = 14;
const WALL_TILES = [42, 43, 52] as const;
const FOG_TINTS: readonly string[] = Array.from({ length: 16 }, (_, i) => {
  const byte = Math.round((1 - (i / 15) * 0.72) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${byte}${byte}${byte}`;
});

const LAYOUT: readonly string[] = [
  "########################",
  "#......................#",
  "#..####....++++....##..#",
  "#..#............#......#",
  "#..#..##....##..#..==..#",
  "#.....#......#.........#",
  "####..#..##..#..####...#",
  "#........##............#",
  "#..====......####......#",
  "#.....#......#.....##..#",
  "#..#..####...#..#......#",
  "#..#............#..++..#",
  "#..##########...#......#",
  "#......................#",
  "########################",
];

interface Player {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
}

interface Billboard {
  x: number;
  y: number;
  kind: "slime" | "beacon";
  dist: number;
}

interface Level {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly spawn: { readonly x: number; readonly y: number };
  readonly sprites: Billboard[];
}

interface Assets {
  readonly walls: readonly SpriteFrame[];
  readonly slime: AnimationClip;
  readonly beacon: AnimationClip;
}

function wallId(ch: string): number {
  if (ch === "#") return 1;
  if (ch === "+") return 2;
  if (ch === "=") return 3;
  return 0;
}

function parseMap(rows: readonly string[]): Level {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < width; x++) cells[y * width + x] = wallId(row[x] ?? ".");
  }
  return {
    width,
    height,
    cells,
    spawn: { x: 2.5, y: 1.5 },
    sprites: [
      { x: 8.5, y: 1.5, kind: "slime", dist: 0 },
      { x: 14.5, y: 1.5, kind: "slime", dist: 0 },
      { x: 20.5, y: 1.5, kind: "slime", dist: 0 },
      { x: 5.5, y: 7.5, kind: "slime", dist: 0 },
      { x: 16.5, y: 7.5, kind: "slime", dist: 0 },
      { x: 10.5, y: 9.5, kind: "slime", dist: 0 },
      { x: 21.5, y: 5.5, kind: "slime", dist: 0 },
      { x: 5.5, y: 11.5, kind: "slime", dist: 0 },
      { x: 3.5, y: 13.5, kind: "beacon", dist: 0 },
      { x: 12.5, y: 13.5, kind: "beacon", dist: 0 },
      { x: 20.5, y: 13.5, kind: "beacon", dist: 0 },
      { x: 15.5, y: 4.5, kind: "beacon", dist: 0 },
    ],
  };
}

function fogStep(dist: number, side: number): number {
  const amount = Math.min(0.72, dist / FOG + (side === 1 ? 0.18 : 0));
  return Math.min(FOG_TINTS.length - 1, Math.round((amount / 0.72) * (FOG_TINTS.length - 1)));
}

function rotate(player: Player, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dirX = player.dirX * c - player.dirY * s;
  const dirY = player.dirX * s + player.dirY * c;
  const planeX = player.planeX * c - player.planeY * s;
  const planeY = player.planeX * s + player.planeY * c;
  player.dirX = dirX;
  player.dirY = dirY;
  player.planeX = planeX;
  player.planeY = planeY;
}

function farFirst(a: Billboard, b: Billboard): number {
  return b.dist - a.dist;
}

export function raycaster(parent: HTMLElement): HazumiApp {
  return start(
    { backend: webgl2({ smoothing: false }), width: 600, height: 600, parent, seed: 8 },
    async (scene) => {
      const width = scene.width;
      const [tileImage, spriteImage] = await Promise.all([
        loadImage("/examples/assets/dungeon-tiles.png"),
        loadImage("/examples/assets/dungeon-sprites.png"),
      ]);

      const tiles = spritesheet(tileImage, { frame: [16, 16] });
      const sprites = spritesheet(spriteImage, {
        frame: [16, 16],
        clips: {
          slimeMove: { frames: [112, 113, 114, 115, 116, 117], fps: 7 },
          beacon: { frames: [90, 91, 92, 93, 94, 95], fps: 8 },
        },
      });

      const assets: Assets = {
        walls: WALL_TILES.map((index) => tiles.frame(index)),
        slime: sprites.clip("slimeMove"),
        beacon: sprites.clip("beacon"),
      };
      if (assets.walls[0] === undefined) throw new Error("wall tilesheet produced no frames");

      const map = parseMap(LAYOUT);
      const player: Player = {
        x: map.spawn.x,
        y: map.spawn.y,
        dirX: 1,
        dirY: 0,
        planeX: 0,
        planeY: 0.66,
      };
      const depth = new Float32Array(width);
      let fps = 0;
      let lastFog = -1;

      function applyFog(dist: number, side: number): void {
        const step = fogStep(dist, side);
        if (step === lastFog) return;
        lastFog = step;
        const color = FOG_TINTS[step];
        if (color !== undefined) tint(color);
      }

      function cell(x: number, y: number): number {
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return 1;
        return map.cells[cy * map.width + cx] ?? 1;
      }

      function blocked(x: number, y: number): boolean {
        return (
          cell(x - RADIUS, y - RADIUS) !== 0 ||
          cell(x + RADIUS, y - RADIUS) !== 0 ||
          cell(x - RADIUS, y + RADIUS) !== 0 ||
          cell(x + RADIUS, y + RADIUS) !== 0
        );
      }

      function tryMove(dx: number, dy: number): void {
        if (!blocked(player.x + dx, player.y)) player.x += dx;
        if (!blocked(player.x, player.y + dy)) player.y += dy;
      }

      function castColumn(col: number, viewWidth: number, viewHeight: number): void {
        const cameraX = (2 * col) / viewWidth - 1;
        const rayDirX = player.dirX + player.planeX * cameraX;
        const rayDirY = player.dirY + player.planeY * cameraX;
        let mapX = Math.floor(player.x);
        let mapY = Math.floor(player.y);
        const deltaX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
        const deltaY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
        const stepX = rayDirX < 0 ? -1 : 1;
        const stepY = rayDirY < 0 ? -1 : 1;
        let sideX = rayDirX < 0 ? (player.x - mapX) * deltaX : (mapX + 1 - player.x) * deltaX;
        let sideY = rayDirY < 0 ? (player.y - mapY) * deltaY : (mapY + 1 - player.y) * deltaY;
        let side = 0;
        let tile = 0;
        for (let hops = 0; tile === 0 && hops < 64; hops++) {
          if (sideX < sideY) {
            sideX += deltaX;
            mapX += stepX;
            side = 0;
          } else {
            sideY += deltaY;
            mapY += stepY;
            side = 1;
          }
          tile = cell(mapX, mapY);
        }

        const raw =
          side === 0
            ? (mapX - player.x + (1 - stepX) / 2) / rayDirX
            : (mapY - player.y + (1 - stepY) / 2) / rayDirY;
        const dist = raw < 0.05 ? 0.05 : raw;
        depth[col] = dist;

        const wall = assets.walls[tile - 1];
        if (wall === undefined) return;
        let wallX = side === 0 ? player.y + dist * rayDirY : player.x + dist * rayDirX;
        wallX -= Math.floor(wallX);
        let texX = Math.floor(wallX * wall.width);
        if (side === 0 && rayDirX > 0) texX = wall.width - texX - 1;
        if (side === 1 && rayDirY < 0) texX = wall.width - texX - 1;
        texX = Math.max(0, Math.min(wall.width - 1, texX));
        const lineH = viewHeight / dist;
        applyFog(dist, side);
        image(wall, col, -lineH / 2 + viewHeight / 2, 1, lineH, texX, 0, 1, wall.height);
      }

      function drawSprites(viewWidth: number, viewHeight: number): void {
        for (let i = 0; i < map.sprites.length; i++) {
          const sprite = map.sprites[i];
          if (sprite === undefined) continue;
          const dx = sprite.x - player.x;
          const dy = sprite.y - player.y;
          sprite.dist = dx * dx + dy * dy;
        }
        map.sprites.sort(farFirst);

        for (let i = 0; i < map.sprites.length; i++) {
          const sprite = map.sprites[i];
          if (sprite === undefined) continue;
          const relX = sprite.x - player.x;
          const relY = sprite.y - player.y;
          const inv = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
          const tx = inv * (player.dirY * relX - player.dirX * relY);
          const ty = inv * (-player.planeY * relX + player.planeX * relY);
          if (ty <= 0.05) continue;

          const screenX = (viewWidth / 2) * (1 + tx / ty);
          const spriteH = Math.abs(viewHeight / ty);
          const clip = sprite.kind === "beacon" ? assets.beacon : assets.slime;
          const frame = clip.at(time.elapsed);
          const x0 = Math.floor(screenX - spriteH / 2);
          const y0 = -spriteH / 2 + viewHeight / 2;
          applyFog(ty, 0);
          for (let col = x0; col < x0 + spriteH; col++) {
            if (col < 0 || col >= viewWidth || ty >= (depth[col] ?? 0)) continue;
            const texX = Math.max(
              0,
              Math.min(frame.width - 1, Math.floor(((col - x0) * frame.width) / spriteH)),
            );
            image(frame, col, y0, 1, spriteH, texX, 0, 1, frame.height);
          }
        }
      }

      function drawMinimap(viewHeight: number): void {
        const size = 7;
        const originX = 12;
        const originY = viewHeight - map.height * size - 12;
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            fill(cell(x, y) === 0 ? "oklch(0.18 0.02 265 / 0.72)" : "oklch(0.42 0.06 55 / 0.85)");
            rect(originX + x * size, originY + y * size, size - 1, size - 1);
          }
        }
        const px = originX + player.x * size;
        const py = originY + player.y * size;
        fill("oklch(0.82 0.16 145)");
        circle(px, py, 4);
        stroke("oklch(0.9 0.12 90)");
        strokeWeight(2);
        line(px, py, px + player.dirX * 10, py + player.dirY * 10);
        noStroke();
      }

      return {
        update: (dt: number): void => {
          if (keyIsDown("ArrowLeft") || keyIsDown("q") || keyIsDown("Q"))
            rotate(player, -TURN * dt);
          if (keyIsDown("ArrowRight") || keyIsDown("e") || keyIsDown("E"))
            rotate(player, TURN * dt);
          if (input.mouseIsPressed) rotate(player, (input.mouseX - input.previousMouseX) * 0.008);

          let ax = 0;
          let ay = 0;
          if (keyIsDown("ArrowUp") || keyIsDown("w") || keyIsDown("W")) {
            ax += player.dirX;
            ay += player.dirY;
          }
          if (keyIsDown("ArrowDown") || keyIsDown("s") || keyIsDown("S")) {
            ax -= player.dirX;
            ay -= player.dirY;
          }
          if (keyIsDown("a") || keyIsDown("A")) {
            ax += player.dirY;
            ay -= player.dirX;
          }
          if (keyIsDown("d") || keyIsDown("D")) {
            ax -= player.dirY;
            ay += player.dirX;
          }
          const len = Math.hypot(ax, ay);
          if (len > 0) tryMove((ax / len) * MOVE * dt, (ay / len) * MOVE * dt);
        },

        draw: (): void => {
          const viewWidth = screen.width;
          const viewHeight = screen.height;
          background("oklch(0.16 0.03 265)");
          noStroke();
          fill("oklch(0.22 0.03 80)");
          rect(0, viewHeight / 2, viewWidth, viewHeight / 2);

          lastFog = -1;
          for (let col = 0; col < viewWidth; col++) castColumn(col, viewWidth, viewHeight);
          drawSprites(viewWidth, viewHeight);
          noTint();

          camera.screen(() => {
            drawMinimap(viewHeight);
            if (time.delta > 0) fps += (1 / time.delta - fps) * 0.15;
            fill("oklch(0.92 0.02 250)");
            textSize(13);
            text(
              `${Math.round(fps)} fps  ${(time.delta * 1000).toFixed(1)} ms  ${viewWidth} rays`,
              14,
              28,
            );
            text("WASD move · Q/E or drag look", 14, 46);
          });
        },
      };
    },
  );
}
