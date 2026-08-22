export const DUNGEON_RUN: readonly { readonly name: string; readonly code: string }[] = [
  {
    name: "scene.js",
    code: `import { loadImage, spritesheet } from 'hazumi/assets';
import { createGame } from './game.js';

const { audio, camera: initialCamera } = s;
const [tileImage, spriteImage, hit, goal, ambience] = await Promise.all([
  loadImage('/examples/assets/dungeon-tiles.png'),
  loadImage('/examples/assets/dungeon-sprites.png'),
  audio.load('/examples/assets/dungeon-hit.wav'),
  audio.load('/examples/assets/dungeon-goal.wav'),
  audio.load('/examples/assets/dungeon-ambience.wav'),
]);

const tiles = spritesheet(tileImage, { frame: [16, 16] });
const sprites = spritesheet(spriteImage, {
  frame: [16, 16],
  clips: {
    knightIdle: { frames: [140, 141, 142, 143, 144, 145], fps: 8 },
    knightRun: { frames: [168, 169, 170, 171, 172, 173], fps: 8 },
    slimeMove: { frames: [112, 113, 114, 115, 116, 117], fps: 7 },
    beacon: { frames: [90, 91, 92, 93, 94, 95], fps: 8 },
  },
});

return createGame(audio, initialCamera, {
  tiles,
  animation: {
    idle: sprites.clip('knightIdle'),
    run: sprites.clip('knightRun'),
    slime: sprites.clip('slimeMove'),
    beacon: sprites.clip('beacon'),
  },
  sound: { hit, goal, ambience },
});`,
  },
  {
    name: "game.js",
    code: `import { background, fill, image, pop, push, rect, scale, text, textSize, translate } from 'hazumi/draw';
import { keyIsDown, keyJustPressed, pointerJustPressed } from 'hazumi/input';
import { collision } from 'hazumi/math';
import { camera, time } from 'hazumi/scene';
import { createLevel } from './level.js';
import { bodyFor, createMover } from './physics.js';

const PLAYER = { bodySize: 22, drawSize: 32, speed: 300 };
const ENEMY = { bodySize: 20, drawSize: 32 };

export function createGame(audio, initialCamera, assets) {
  const level = createLevel(assets.tiles);
  const move = createMover(level);
  const spawn = { x: level.tileSize * 2.5, y: level.tileSize * 2.5 };
  const goal = {
    x: level.tileSize * (level.columns - 2.5),
    y: level.tileSize * (level.rows - 2.5),
  };
  const goalShape = collision.circle(goal.x, goal.y, 18);
  const enemySpawns = [
    [4.5, 9.5, -1, 70],
    [9.5, 16.5, 1, 82],
    [15, 8.5, -1, 76],
    [21, 22, 1, 88],
    [27, 12.5, -1, 72],
    [33, 18.5, 1, 94],
  ].map(([column, row, direction, speed], index) => ({
    x: column * level.tileSize,
    y: row * level.tileSize,
    previousX: column * level.tileSize,
    previousY: row * level.tileSize,
    direction,
    speed,
    phase: index * 0.13,
  }));
  const enemies = enemySpawns.map((enemy) => ({ ...enemy }));
  const player = {
    x: spawn.x,
    y: spawn.y,
    previousX: spawn.x,
    previousY: spawn.y,
    facing: 1,
    moving: false,
    animationStartedAt: 0,
  };
  let ambience = null;
  let hits = 0;
  let won = false;

  function reset(timestamp, clearHits) {
    Object.assign(player, {
      x: spawn.x,
      y: spawn.y,
      previousX: spawn.x,
      previousY: spawn.y,
      facing: 1,
      moving: false,
      animationStartedAt: timestamp,
    });
    for (let index = 0; index < enemies.length; index++) {
      Object.assign(enemies[index], enemySpawns[index]);
    }
    if (clearHits) hits = 0;
    won = false;
    initialCamera.lookAt(player.x, player.y);
  }

  function updatePlayer(dt) {
    let dx = Number(keyIsDown('ArrowRight') || keyIsDown('d') || keyIsDown('D')) -
      Number(keyIsDown('ArrowLeft') || keyIsDown('a') || keyIsDown('A'));
    let dy = Number(keyIsDown('ArrowDown') || keyIsDown('s') || keyIsDown('S')) -
      Number(keyIsDown('ArrowUp') || keyIsDown('w') || keyIsDown('W'));
    const moving = dx !== 0 || dy !== 0;

    if (ambience === null && (moving || pointerJustPressed())) {
      ambience = audio.loop(assets.sound.ambience, { gain: 0.32 });
    }
    if (moving !== player.moving) player.animationStartedAt = time.elapsed;
    player.moving = moving;
    if (dx !== 0) player.facing = dx < 0 ? -1 : 1;

    const length = Math.hypot(dx, dy) || 1;
    dx = dx / length * PLAYER.speed * dt;
    dy = dy / length * PLAYER.speed * dt;
    move(player, PLAYER.bodySize, dx, dy);
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      enemy.previousX = enemy.x;
      enemy.previousY = enemy.y;
      if (move(enemy, ENEMY.bodySize, enemy.direction * enemy.speed * dt, 0)) {
        enemy.direction *= -1;
      }
    }
  }

  function touchesEnemy() {
    const playerBody = bodyFor(player, PLAYER.bodySize);
    return enemies.some((enemy) =>
      collision.overlapsAabb(playerBody, bodyFor(enemy, ENEMY.bodySize)),
    );
  }

  function drawActor(frame, actor, drawSize, alpha, facing) {
    const x = actor.previousX + (actor.x - actor.previousX) * alpha;
    const y = actor.previousY + (actor.y - actor.previousY) * alpha;
    push();
    translate(x, y);
    scale(facing, 1);
    image(frame, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    pop();
  }

  reset(0, true);

  return {
    update(dt) {
      if (keyJustPressed('r') || keyJustPressed('R')) reset(time.elapsed, true);

      player.previousX = player.x;
      player.previousY = player.y;
      if (!won) {
        updatePlayer(dt);
        updateEnemies(dt);

        if (touchesEnemy()) {
          hits++;
          audio.play(assets.sound.hit, { gain: 0.7, rate: 0.92 });
          reset(time.elapsed, false);
        } else {
          won = collision.overlapsCircleAabb(goalShape, bodyFor(player, PLAYER.bodySize));
        }

        if (won) {
          audio.play(assets.sound.goal, { gain: 0.85 });
          ambience?.stop();
          ambience = null;
          player.moving = false;
          player.animationStartedAt = time.elapsed;
        }
      }
      camera.follow(player.x, player.y, 0.22);
    },

    draw(alpha) {
      background('oklch(0.08 0.018 265)');
      level.map.draw();

      const beaconSize = 36 + Math.sin(time.elapsed * 5) * 4;
      image(
        assets.animation.beacon.at(time.elapsed),
        goal.x - beaconSize / 2,
        goal.y - beaconSize / 2,
        beaconSize,
        beaconSize,
      );
      for (const enemy of enemies) {
        drawActor(
          assets.animation.slime.at(time.elapsed + enemy.phase),
          enemy,
          ENEMY.drawSize,
          alpha,
          enemy.direction,
        );
      }
      const knight = player.moving ? assets.animation.run : assets.animation.idle;
      drawActor(
        knight.at(time.elapsed - player.animationStartedAt),
        player,
        PLAYER.drawSize,
        alpha,
        player.facing,
      );

      camera.screen(() => {
        fill('oklch(0.13 0.025 275 / 0.88)');
        rect(14, 14, won ? 244 : 300, 58);
        fill('white');
        textSize(14);
        text(
          won
            ? 'Beacon reached — press R to replay'
            : 'WASD / arrows · hits ' + hits + ' · audio ' + audio.activeVoices,
          28,
          49,
        );
      });
    },
  };
}`,
  },
  {
    name: "level.js",
    code: `import { EMPTY_TILE, tilemap } from 'hazumi/assets';
import { collision } from 'hazumi/math';

export function createLevel(tiles) {
  const tileSize = 32;
  const columns = 40;
  const rows = 28;
  const floor = new Int16Array(columns * rows);
  const decor = new Int16Array(columns * rows);
  const walls = new Int16Array(columns * rows);
  const colliders = new Array(columns * rows).fill(null);
  const props = [0, 1, 2, 13, 14];
  decor.fill(EMPTY_TILE);
  walls.fill(EMPTY_TILE);

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const border = column === 0 || row === 0 || column === columns - 1 || row === rows - 1;
      const gap = 3 + ((column / 6) * 4) % (rows - 6);
      const barrier = column > 0 && column < columns - 1 && column % 6 === 0 &&
        Math.abs(row - gap) > 1;

      floor[index] = (column * 3 + row * 5) % 7 === 0 ? 32 : 23;
      if (border || barrier) {
        walls[index] = (column * 7 + row * 11) % 29 === 0 ? 52 : 42 + (column + row) % 3;
        colliders[index] = collision.aabb(column * tileSize, row * tileSize, tileSize, tileSize);
      } else if ((column * 11 + row * 7) % 37 === 0) {
        decor[index] = props[(column + row) % props.length];
      }
    }
  }

  return {
    tileSize,
    columns,
    rows,
    colliders,
    map: tilemap({
      columns,
      rows,
      tileWidth: tileSize,
      tileHeight: tileSize,
      layers: [
        { name: 'floor', sheet: tiles, tiles: floor },
        { name: 'decor', sheet: tiles, tiles: decor },
        { name: 'walls', sheet: tiles, tiles: walls },
      ],
    }),
  };
}`,
  },
  {
    name: "physics.js",
    code: `import { collision } from 'hazumi/math';

export function bodyFor(actor, size) {
  return collision.aabb(actor.x - size / 2, actor.y - size / 2, size, size);
}

export function createMover(level) {
  const displacement = { x: 0, y: 0 };

  return function move(actor, size, dx, dy) {
    if (dx === 0 && dy === 0) return false;
    collision.slideAabb(bodyFor(actor, size), dx, dy, level.colliders, displacement);
    actor.x += displacement.x;
    actor.y += displacement.y;
    return displacement.x !== dx || displacement.y !== dy;
  };
}`,
  },
];
