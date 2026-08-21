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
// Avoid the slimes and reach the orange beacon. Press R to restart.
const TILE = 32;
const COLUMNS = 40;
const ROWS = 28;
const PLAYER_SIZE = 22;
const PLAYER_DRAW_SIZE = 32;
const ENEMY_SIZE = 20;
const ENEMY_DRAW_SIZE = 32;
const SPEED = 300;

const [tileImage, spriteImage] = await Promise.all([
  s.loadImage('/examples/assets/dungeon-tiles.png'),
  s.loadImage('/examples/assets/dungeon-sprites.png'),
]);
const tiles = spritesheet(tileImage, {
  frame: [16, 16],
});
const sprites = spritesheet(spriteImage, {
  frame: [16, 16],
  clips: {
    knightIdle: { frames: [140, 141, 142, 143, 144, 145], fps: 8 },
    knightRun: { frames: [168, 169, 170, 171, 172, 173], fps: 8 },
    slimeMove: { frames: [112, 113, 114, 115, 116, 117], fps: 7 },
    beacon: { frames: [90, 91, 92, 93, 94, 95], fps: 8 },
  },
});
const knightIdle = sprites.clip('knightIdle');
const knightRun = sprites.clip('knightRun');
const slimeMove = sprites.clip('slimeMove');
const beacon = sprites.clip('beacon');
const floorTiles = new Int16Array(COLUMNS * ROWS);
const decorTiles = new Int16Array(COLUMNS * ROWS);
const wallTiles = new Int16Array(COLUMNS * ROWS);
const props = [0, 1, 2, 13, 14];
decorTiles.fill(EMPTY_TILE);
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

    floorTiles[index] = (column * 3 + row * 5) % 7 === 0 ? 32 : 23;
    if (border || barrier) {
      wallTiles[index] = (column * 7 + row * 11) % 29 === 0 ? 52 : 42 + (column + row) % 3;
      wallBoxes[index] = collision.aabb(column * TILE, row * TILE, TILE, TILE);
    } else if ((column * 11 + row * 7) % 37 === 0) {
      decorTiles[index] = props[(column + row) % props.length];
    }
  }
}

const dungeon = tilemap({
  columns: COLUMNS,
  rows: ROWS,
  tileWidth: TILE,
  tileHeight: TILE,
  layers: [
    { name: 'floor', sheet: tiles, tiles: floorTiles },
    { name: 'decor', sheet: tiles, tiles: decorTiles },
    { name: 'walls', sheet: tiles, tiles: wallTiles },
  ],
});

const spawn = { x: TILE * 2.5, y: TILE * 2.5 };
const goal = { x: TILE * (COLUMNS - 2.5), y: TILE * (ROWS - 2.5) };
const goalShape = collision.circle(goal.x, goal.y, 18);
const enemySpawns = [
  { x: TILE * 4.5, y: TILE * 9.5, direction: -1, speed: 70 },
  { x: TILE * 9.5, y: TILE * 16.5, direction: 1, speed: 82 },
  { x: TILE * 15, y: TILE * 8.5, direction: -1, speed: 76 },
  { x: TILE * 21, y: TILE * 22, direction: 1, speed: 88 },
  { x: TILE * 27, y: TILE * 12.5, direction: -1, speed: 72 },
  { x: TILE * 33, y: TILE * 18.5, direction: 1, speed: 94 },
];
const enemies = enemySpawns.map((enemy, index) => ({
  ...enemy,
  previousX: enemy.x,
  previousY: enemy.y,
  phase: index * 0.13,
}));
let x = spawn.x;
let y = spawn.y;
let previousX = x;
let previousY = y;
let facing = 1;
let running = false;
let animationStartedAt = 0;
let hits = 0;
let won = false;

function reset(camera, time, clearHits) {
  x = spawn.x;
  y = spawn.y;
  previousX = x;
  previousY = y;
  facing = 1;
  running = false;
  animationStartedAt = time;
  if (clearHits) hits = 0;
  won = false;
  for (let index = 0; index < enemies.length; index++) {
    const enemy = enemies[index];
    const source = enemySpawns[index];
    enemy.x = source.x;
    enemy.y = source.y;
    enemy.previousX = source.x;
    enemy.previousY = source.y;
    enemy.direction = source.direction;
  }
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

function moveEnemy(enemy, amount) {
  const moving = collision.aabb(
    enemy.x - ENEMY_SIZE / 2,
    enemy.y - ENEMY_SIZE / 2,
    ENEMY_SIZE,
    ENEMY_SIZE,
  );
  const delta = { x: amount, y: 0 };
  const firstColumn = Math.max(0, Math.floor(Math.min(moving.minX, moving.minX + amount) / TILE));
  const lastColumn = Math.min(COLUMNS - 1, Math.floor(Math.max(moving.maxX, moving.maxX + amount) / TILE));
  const firstRow = Math.max(0, Math.floor(moving.minY / TILE));
  const lastRow = Math.min(ROWS - 1, Math.floor(moving.maxY / TILE));
  let safe = 1;

  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const wall = wallBoxes[row * COLUMNS + column];
      if (wall === null) continue;
      const hit = collision.sweepAabb(moving, delta, wall, reusableHit);
      if (hit !== null && hit.time < safe) safe = hit.time;
    }
  }

  enemy.x += amount * safe;
  if (safe < 1) enemy.direction *= -1;
}

reset(s.camera, 0, true);

return {
  update(dt, context) {
    const { camera, keyIsDown, keyJustPressed, t } = context;
    if (keyJustPressed('r') || keyJustPressed('R')) reset(camera, t, true);

    previousX = x;
    previousY = y;
    if (!won) {
      let dx = Number(keyIsDown('ArrowRight') || keyIsDown('d') || keyIsDown('D')) -
        Number(keyIsDown('ArrowLeft') || keyIsDown('a') || keyIsDown('A'));
      let dy = Number(keyIsDown('ArrowDown') || keyIsDown('s') || keyIsDown('S')) -
        Number(keyIsDown('ArrowUp') || keyIsDown('w') || keyIsDown('W'));
      const nextRunning = dx !== 0 || dy !== 0;
      if (nextRunning !== running) animationStartedAt = t;
      running = nextRunning;
      if (dx !== 0) facing = dx < 0 ? -1 : 1;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      moveAxis(dx * SPEED * dt, true);
      moveAxis(dy * SPEED * dt, false);

      for (const enemy of enemies) {
        enemy.previousX = enemy.x;
        enemy.previousY = enemy.y;
        moveEnemy(enemy, enemy.direction * enemy.speed * dt);
      }

      const player = collision.aabb(
        x - PLAYER_SIZE / 2,
        y - PLAYER_SIZE / 2,
        PLAYER_SIZE,
        PLAYER_SIZE,
      );
      let touchedEnemy = false;
      for (const enemy of enemies) {
        const enemyShape = collision.aabb(
          enemy.x - ENEMY_SIZE / 2,
          enemy.y - ENEMY_SIZE / 2,
          ENEMY_SIZE,
          ENEMY_SIZE,
        );
        if (!collision.overlapsAabb(player, enemyShape)) continue;
        hits++;
        reset(camera, t, false);
        touchedEnemy = true;
        break;
      }

      won = !touchedEnemy && collision.overlapsCircleAabb(goalShape, player);
      if (won && running) {
        running = false;
        animationStartedAt = t;
      }
    }
    camera.follow(x, y, 0.22);
  },

  draw(alpha, context) {
    const { background, camera, fill, image, pop, push, rect, scale, text, textSize, t, translate } = context;
    background('oklch(0.08 0.018 265)');
    dungeon.draw(context);

    const beaconSize = 36 + Math.sin(t * 5) * 4;
    image(beacon.at(t), goal.x - beaconSize / 2, goal.y - beaconSize / 2, beaconSize, beaconSize);

    for (const enemy of enemies) {
      const enemyX = enemy.previousX + (enemy.x - enemy.previousX) * alpha;
      const enemyY = enemy.previousY + (enemy.y - enemy.previousY) * alpha;
      push();
      translate(enemyX, enemyY);
      scale(enemy.direction, 1);
      image(
        slimeMove.at(t + enemy.phase),
        -ENEMY_DRAW_SIZE / 2,
        -ENEMY_DRAW_SIZE / 2,
        ENEMY_DRAW_SIZE,
        ENEMY_DRAW_SIZE,
      );
      pop();
    }

    const drawX = previousX + (x - previousX) * alpha;
    const drawY = previousY + (y - previousY) * alpha;
    push();
    translate(drawX, drawY);
    scale(facing, 1);
    image(
      running ? knightRun.at(t - animationStartedAt) : knightIdle.at(t - animationStartedAt),
      -PLAYER_DRAW_SIZE / 2,
      -PLAYER_DRAW_SIZE / 2,
      PLAYER_DRAW_SIZE,
      PLAYER_DRAW_SIZE,
    );
    pop();

    camera.screen(() => {
      fill('oklch(0.13 0.025 275 / 0.88)');
      rect(14, 14, won ? 244 : 300, 58);
      fill('white');
      textSize(14);
      text(
        won ? 'Beacon reached — press R to replay' : 'WASD / arrows · orange beacon · hits ' + hits,
        28,
        49,
      );
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
