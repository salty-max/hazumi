/** Starter scenes, written the way a user would write them. */
export interface Starter {
  readonly name: string;
  readonly code: string;
}

export const STARTERS: readonly Starter[] = [
  {
    name: "Hello circle",
    code: `// Everything you need is destructured from the context.
return {
  draw(_alpha, { background, circle, fill, width, height, t }) {
    background('oklch(0.15 0.02 260)');
    fill('oklch(0.72 0.18 250)');
    circle(width / 2, height / 2, 180 + Math.sin(t * 2) * 70);
  },
};`,
  },
  {
    name: "Noise field",
    code: `// s is the same context, available while the scene is created.
const points = Array.from({ length: 2500 }, () => ({
  x: s.random.range(0, s.width),
  y: s.random.range(0, s.height),
}));

return {
  draw(_alpha, { background, circle, fill, noise, width, height, t }) {
    // A translucent background fades the last frame instead of clearing it.
    background('oklch(0.12 0.02 265 / 0.08)');

    for (const p of points) {
      const a = noise.noise3(p.x * 0.003, p.y * 0.003, t * 0.1) * Math.PI * 3;
      p.x = (p.x + Math.cos(a) * 1.5 + width) % width;
      p.y = (p.y + Math.sin(a) * 1.5 + height) % height;
      fill('oklch(0.8 0.14 210 / 0.35)');
      circle(p.x, p.y, 2);
    }
  },
};`,
  },
  {
    name: "Input edges",
    code: `const player = { x: s.width / 2, y: s.height / 2 };
let hue = 285;
let size = 72;

return {
  update(dt, { keyIsDown, keyJustPressed, pointerJustPressed, mouseX, mouseY, wheelY }) {
    if (keyIsDown('ArrowLeft')) player.x -= 240 * dt;
    if (keyIsDown('ArrowRight')) player.x += 240 * dt;
    if (keyIsDown('ArrowUp')) player.y -= 240 * dt;
    if (keyIsDown('ArrowDown')) player.y += 240 * dt;

    // One change per press, even when the browser repeats the keydown event.
    if (keyJustPressed(' ')) hue = (hue + 55) % 360;
    // Pointer Events covers mouse, pen, and touch through the same edge.
    if (pointerJustPressed()) {
      player.x = mouseX;
      player.y = mouseY;
    }
    size = Math.max(24, Math.min(160, size - wheelY * 0.25));
  },
  draw(_alpha, { background, circle, fill }) {
    background('oklch(0.14 0.02 260)');
    fill(\`oklch(0.72 0.18 \${hue})\`);
    circle(player.x, player.y, size);
  },
};`,
  },
  {
    name: "Dungeon run",
    code: `// Click the preview, then use WASD or the arrow keys.
// Reach the violet beacon. Press R to restart.
const TILE = 32;
const COLUMNS = 40;
const ROWS = 28;
const PLAYER_SIZE = 22;
const SPEED = 300;

const sheet = spritesheet(await s.loadImage('/examples/assets/tiles.png'), {
  frame: [16, 16],
});
const floorTiles = new Int16Array(COLUMNS * ROWS);
const wallTiles = new Int16Array(COLUMNS * ROWS);
floorTiles.fill(EMPTY_TILE);
wallTiles.fill(EMPTY_TILE);

const wallBoxes = new Array(COLUMNS * ROWS).fill(null);
const reusableHit = collision.createSweepHit();

for (let row = 0; row < ROWS; row++) {
  for (let column = 0; column < COLUMNS; column++) {
    const index = row * COLUMNS + column;
    const border = column === 0 || row === 0 || column === COLUMNS - 1 || row === ROWS - 1;
    let barrier = false;
    if (column > 0 && column < COLUMNS - 1 && column % 6 === 0) {
      const gap = 3 + ((column / 6) * 4) % (ROWS - 6);
      barrier = Math.abs(row - gap) > 1;
    }

    if (border || barrier) {
      wallTiles[index] = 12 + (column + row) % 4;
      wallBoxes[index] = collision.aabb(column * TILE, row * TILE, TILE, TILE);
    } else if ((column * 11 + row * 7) % 19 === 0) {
      floorTiles[index] = 8 + (column + row) % 4;
    }
  }
}

const dungeon = tilemap({
  columns: COLUMNS,
  rows: ROWS,
  tileWidth: TILE,
  tileHeight: TILE,
  layers: [
    { name: 'floor', sheet, tiles: floorTiles },
    { name: 'walls', sheet, tiles: wallTiles },
  ],
});

const spawn = { x: TILE * 2.5, y: TILE * 2.5 };
const goal = { x: TILE * (COLUMNS - 2.5), y: TILE * (ROWS - 2.5) };
const goalShape = collision.circle(goal.x, goal.y, 18);
let x = spawn.x;
let y = spawn.y;
let previousX = x;
let previousY = y;
let won = false;

function reset(camera) {
  x = spawn.x;
  y = spawn.y;
  previousX = x;
  previousY = y;
  won = false;
  camera.lookAt(x, y);
}

function moveAxis(amount, horizontal) {
  if (amount === 0) return;
  const moving = collision.aabb(x - PLAYER_SIZE / 2, y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
  const delta = { x: horizontal ? amount : 0, y: horizontal ? 0 : amount };
  const firstColumn = Math.max(0, Math.floor(Math.min(moving.minX, moving.minX + delta.x) / TILE));
  const lastColumn = Math.min(COLUMNS - 1, Math.floor(Math.max(moving.maxX, moving.maxX + delta.x) / TILE));
  const firstRow = Math.max(0, Math.floor(Math.min(moving.minY, moving.minY + delta.y) / TILE));
  const lastRow = Math.min(ROWS - 1, Math.floor(Math.max(moving.maxY, moving.maxY + delta.y) / TILE));
  let safe = 1;

  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const wall = wallBoxes[row * COLUMNS + column];
      if (wall === null) continue;
      const hit = collision.sweepAabb(moving, delta, wall, reusableHit);
      if (hit !== null && hit.time < safe) safe = hit.time;
    }
  }

  x += delta.x * safe;
  y += delta.y * safe;
}

reset(s.camera);

return {
  update(dt, context) {
    const { camera, keyIsDown, keyJustPressed } = context;
    if (keyJustPressed('r') || keyJustPressed('R')) reset(camera);

    previousX = x;
    previousY = y;
    if (!won) {
      let dx = Number(keyIsDown('ArrowRight') || keyIsDown('d') || keyIsDown('D')) -
        Number(keyIsDown('ArrowLeft') || keyIsDown('a') || keyIsDown('A'));
      let dy = Number(keyIsDown('ArrowDown') || keyIsDown('s') || keyIsDown('S')) -
        Number(keyIsDown('ArrowUp') || keyIsDown('w') || keyIsDown('W'));
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      moveAxis(dx * SPEED * dt, true);
      moveAxis(dy * SPEED * dt, false);

      const player = collision.aabb(
        x - PLAYER_SIZE / 2,
        y - PLAYER_SIZE / 2,
        PLAYER_SIZE,
        PLAYER_SIZE,
      );
      won = collision.overlapsCircleAabb(goalShape, player);
    }
    camera.follow(x, y, 0.22);
  },

  draw(alpha, context) {
    const { background, camera, circle, fill, rect, text, textSize, t } = context;
    background('oklch(0.09 0.025 275)');
    dungeon.draw(context);

    fill('oklch(0.72 0.2 300)');
    circle(goal.x, goal.y, 24 + Math.sin(t * 5) * 6);

    const drawX = previousX + (x - previousX) * alpha;
    const drawY = previousY + (y - previousY) * alpha;
    fill('oklch(0.92 0.16 105)');
    rect(drawX - PLAYER_SIZE / 2, drawY - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);

    camera.screen(() => {
      fill('oklch(0.13 0.025 275 / 0.88)');
      rect(14, 14, won ? 244 : 300, 58);
      fill('white');
      textSize(14);
      text(won ? 'Beacon reached — press R to replay' : 'WASD / arrows · find the violet beacon', 28, 49);
    });
  },
};`,
  },
  {
    name: "Transform stack",
    code: `return {
  draw(_alpha, { background, push, pop, translate, rotate, rect, fill, width, height, t }) {
    background('oklch(0.97 0.01 90)');
    push();
    translate(width / 2, height / 2);

    for (let ring = 1; ring <= 6; ring++) {
      push();
      rotate(t * 0.3 / ring * (ring % 2 ? 1 : -1));
      for (let i = 0; i < ring * 3; i++) {
        rotate((Math.PI * 2) / (ring * 3));
        push();
        translate(ring * 38, 0);
        fill(\`oklch(0.6 0.17 \${ring * 45})\`);
        rect(-9, -9, 18, 18);
        pop();
      }
      pop();
    }
    pop();
  },
};`,
  },
  {
    name: "Scoped style",
    code: `// with() restores style on exit — even if the body throws,
// which is the thing push()/pop() cannot promise.
return {
  draw(_alpha, { background, circle, fill, stroke, strokeWeight, with: scoped, width, height }) {
    background('oklch(0.96 0.01 80)');
    fill('oklch(0.55 0.2 25)');

    scoped({ fill: 'oklch(0.6 0.16 200)', stroke: 'white', strokeWeight: 6 }, () => {
      circle(width / 2 - 90, height / 2, 160);
    });

    // Back to the red fill, and no stroke.
    circle(width / 2 + 90, height / 2, 160);
  },
};`,
  },
  {
    name: "Text",
    code: `return {
  draw(_alpha, { background, text, textSize, textAlign, textFont, fill, width, height, t }) {
    background('oklch(0.16 0.03 265)');
    textFont('Georgia, serif');
    textAlign(1, 2); // Align.Center, Baseline.Middle

    for (let i = 0; i < 5; i++) {
      fill(\`oklch(\${0.5 + i * 0.09} 0.15 \${200 + i * 22})\`);
      textSize(20 + i * 14);
      text('Matter', width / 2, 110 + i * 90 + Math.sin(t + i) * 8);
    }
  },
};`,
  },
];
