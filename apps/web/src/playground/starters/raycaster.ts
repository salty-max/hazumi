export const RAYCASTER: readonly { readonly name: string; readonly code: string }[] = [
  {
    name: "scene.js",
    code: `import { loadImage, spritesheet } from 'hazumi/assets';
import { createRaycaster } from './render.js';

const [tileImage, spriteImage] = await Promise.all([
  loadImage('/examples/assets/dungeon-tiles.png'),
  loadImage('/examples/assets/dungeon-sprites.png'),
]);

const tiles = spritesheet(tileImage, { frame: [16, 16] });
const sprites = spritesheet(spriteImage, {
  frame: [16, 16],
  clips: {
    slimeMove: { frames: [112, 113, 114, 115, 116, 117], fps: 7 },
    beacon: { frames: [90, 91, 92, 93, 94, 95], fps: 8 },
  },
});

return createRaycaster({
  walls: [42, 43, 52].map((index) => columnSlices(tiles.frame(index))),
  slime: sprites.clip('slimeMove'),
  beacon: sprites.clip('beacon'),
});

function columnSlices(cell) {
  return Array.from({ length: cell.width }, (_, x) => ({
    source: cell.source,
    x: cell.x + x,
    y: cell.y,
    width: 1,
    height: cell.height,
  }));
}`,
  },
  {
    name: "map.js",
    code: `const WALL = { '#': 1, '+': 2, '=': 3 };

export const LAYOUT = [
  '########################',
  '#......................#',
  '#..####....++++....##..#',
  '#..#............#......#',
  '#..#..##....##..#..==..#',
  '#.....#......#.........#',
  '####..#..##..#..####...#',
  '#........##............#',
  '#..====......####......#',
  '#.....#......#.....##..#',
  '#..#..####...#..#......#',
  '#..#............#..++..#',
  '#..##########...#......#',
  '#......................#',
  '########################',
];

export function createMap() {
  const height = LAYOUT.length;
  const width = LAYOUT[0].length;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = LAYOUT[y];
    for (let x = 0; x < width; x++) cells[y * width + x] = WALL[row[x]] ?? 0;
  }
  return {
    width,
    height,
    cells,
    spawn: { x: 2.5, y: 1.5 },
    sprites: [
      { x: 8.5, y: 1.5, kind: 'slime' },
      { x: 14.5, y: 1.5, kind: 'slime' },
      { x: 20.5, y: 1.5, kind: 'slime' },
      { x: 5.5, y: 7.5, kind: 'slime' },
      { x: 16.5, y: 7.5, kind: 'slime' },
      { x: 10.5, y: 9.5, kind: 'slime' },
      { x: 21.5, y: 5.5, kind: 'slime' },
      { x: 5.5, y: 11.5, kind: 'slime' },
      { x: 3.5, y: 13.5, kind: 'beacon' },
      { x: 12.5, y: 13.5, kind: 'beacon' },
      { x: 20.5, y: 13.5, kind: 'beacon' },
      { x: 15.5, y: 4.5, kind: 'beacon' },
    ],
  };
}`,
  },
  {
    name: "render.js",
    code: `import { background, circle, fill, image, line, noStroke, rect, stroke, strokeWeight, text, textSize } from 'hazumi/draw';
import { input, keyIsDown } from 'hazumi/input';
import { camera, screen, time } from 'hazumi/scene';
import { createMap } from './map.js';

// One DDA ray per column. Walls and sprites are 1px image strips so the
// image pipeline can batch them; distance fog is a second shape pass.
const MOVE = 3.2;
const TURN = 2.2;
const RADIUS = 0.18;
const FOG = 14;

function rotate(player, angle) {
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

function farFirst(a, b) {
  return b.dist - a.dist;
}

export function createRaycaster(assets) {
  const map = createMap();
  const player = {
    x: map.spawn.x,
    y: map.spawn.y,
    dirX: 1,
    dirY: 0,
    planeX: 0,
    planeY: 0.66,
  };
  let depth = new Float32Array(0);
  let sideHit = new Uint8Array(0);
  const slice = { source: assets.walls[0][0].source, x: 0, y: 0, width: 1, height: 16 };
  let fps = 0;

  function resizeBuffers(width) {
    if (depth.length === width) return;
    depth = new Float32Array(width);
    sideHit = new Uint8Array(width);
  }

  function cell(x, y) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return 1;
    return map.cells[cy * map.width + cx];
  }

  function blocked(x, y) {
    return cell(x - RADIUS, y - RADIUS) !== 0 ||
      cell(x + RADIUS, y - RADIUS) !== 0 ||
      cell(x - RADIUS, y + RADIUS) !== 0 ||
      cell(x + RADIUS, y + RADIUS) !== 0;
  }

  function tryMove(dx, dy) {
    if (!blocked(player.x + dx, player.y)) player.x += dx;
    if (!blocked(player.x, player.y + dy)) player.y += dy;
  }

  function castColumn(col, width, height) {
    const cameraX = (2 * col) / width - 1;
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

    const raw = side === 0
      ? (mapX - player.x + (1 - stepX) / 2) / rayDirX
      : (mapY - player.y + (1 - stepY) / 2) / rayDirY;
    const dist = raw < 0.05 ? 0.05 : raw;
    depth[col] = dist;
    sideHit[col] = side;

    const lineH = height / dist;
    const y0 = -lineH / 2 + height / 2;
    let wallX = side === 0 ? player.y + dist * rayDirY : player.x + dist * rayDirX;
    wallX -= Math.floor(wallX);
    const columns = assets.walls[tile - 1];
    if (columns === undefined) return;
    let texX = Math.floor(wallX * columns.length);
    if (side === 0 && rayDirX > 0) texX = columns.length - texX - 1;
    if (side === 1 && rayDirY < 0) texX = columns.length - texX - 1;
    image(columns[Math.max(0, Math.min(columns.length - 1, texX))], col, y0, 1, lineH);
  }

  function drawFog(width, height) {
    for (let col = 0; col < width; col++) {
      const dist = depth[col];
      const alpha = Math.min(0.72, dist / FOG + (sideHit[col] === 1 ? 0.18 : 0));
      if (alpha < 0.04) continue;
      const lineH = height / dist;
      fill('oklch(0.07 0.02 265 / ' + alpha.toFixed(3) + ')');
      rect(col, -lineH / 2 + height / 2, 1, lineH);
    }
  }

  function drawSprites(width, height) {
    for (let i = 0; i < map.sprites.length; i++) {
      const sprite = map.sprites[i];
      const dx = sprite.x - player.x;
      const dy = sprite.y - player.y;
      sprite.dist = dx * dx + dy * dy;
    }
    map.sprites.sort(farFirst);

    for (let i = 0; i < map.sprites.length; i++) {
      const sprite = map.sprites[i];
      const relX = sprite.x - player.x;
      const relY = sprite.y - player.y;
      const inv = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
      const tx = inv * (player.dirY * relX - player.dirX * relY);
      const ty = inv * (-player.planeY * relX + player.planeX * relY);
      if (ty <= 0.05) continue;

      const screenX = (width / 2) * (1 + tx / ty);
      const spriteH = Math.abs(height / ty);
      const frame = (sprite.kind === 'beacon' ? assets.beacon : assets.slime).at(time.elapsed);
      slice.source = frame.source;
      slice.y = frame.y;
      slice.height = frame.height;
      const x0 = Math.floor(screenX - spriteH / 2);
      const y0 = -spriteH / 2 + height / 2;
      for (let col = x0; col < x0 + spriteH; col++) {
        if (col < 0 || col >= width || ty >= depth[col]) continue;
        const texX = Math.floor(((col - x0) * frame.width) / spriteH);
        slice.x = frame.x + Math.max(0, Math.min(frame.width - 1, texX));
        image(slice, col, y0, 1, spriteH);
      }
    }
  }

  function drawMinimap(height) {
    const size = 7;
    const originX = 12;
    const originY = height - map.height * size - 12;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        fill(cell(x, y) === 0 ? 'oklch(0.18 0.02 265 / 0.72)' : 'oklch(0.42 0.06 55 / 0.85)');
        rect(originX + x * size, originY + y * size, size - 1, size - 1);
      }
    }
    const px = originX + player.x * size;
    const py = originY + player.y * size;
    fill('oklch(0.82 0.16 145)');
    circle(px, py, 4);
    stroke('oklch(0.9 0.12 90)');
    strokeWeight(2);
    line(px, py, px + player.dirX * 10, py + player.dirY * 10);
    noStroke();
  }

  return {
    update(dt) {
      if (keyIsDown('ArrowLeft') || keyIsDown('q') || keyIsDown('Q')) rotate(player, -TURN * dt);
      if (keyIsDown('ArrowRight') || keyIsDown('e') || keyIsDown('E')) rotate(player, TURN * dt);
      if (input.mouseIsPressed) rotate(player, (input.mouseX - input.previousMouseX) * 0.008);

      let ax = 0;
      let ay = 0;
      if (keyIsDown('ArrowUp') || keyIsDown('w') || keyIsDown('W')) {
        ax += player.dirX;
        ay += player.dirY;
      }
      if (keyIsDown('ArrowDown') || keyIsDown('s') || keyIsDown('S')) {
        ax -= player.dirX;
        ay -= player.dirY;
      }
      if (keyIsDown('a') || keyIsDown('A')) {
        ax += player.dirY;
        ay -= player.dirX;
      }
      if (keyIsDown('d') || keyIsDown('D')) {
        ax -= player.dirY;
        ay += player.dirX;
      }
      const len = Math.hypot(ax, ay);
      if (len > 0) tryMove((ax / len) * MOVE * dt, (ay / len) * MOVE * dt);
    },

    draw() {
      const width = screen.width;
      const height = screen.height;
      resizeBuffers(width);
      background('oklch(0.16 0.03 265)');
      noStroke();
      fill('oklch(0.22 0.03 80)');
      rect(0, height / 2, width, height / 2);

      for (let col = 0; col < width; col++) castColumn(col, width, height);
      drawFog(width, height);
      drawSprites(width, height);

      camera.screen(() => {
        drawMinimap(height);
        if (time.delta > 0) fps += (1 / time.delta - fps) * 0.15;
        fill('oklch(0.92 0.02 250)');
        textSize(13);
        text(
          Math.round(fps) + ' fps  ' + (time.delta * 1000).toFixed(1) + ' ms  ' + width + ' rays',
          14,
          28,
        );
        text('WASD move · Q/E or drag look', 14, 46);
      });
    },
  };
}`,
  },
];
