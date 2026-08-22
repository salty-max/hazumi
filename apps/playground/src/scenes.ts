import { DUNGEON_RUN } from "./starters/dungeon-run";

/** Starter scenes, written the way a user would write them. */
export interface Starter {
  readonly name: string;
  readonly code: string;
  readonly files?: readonly StarterFile[];
}

export interface StarterFile {
  readonly name: string;
  readonly code: string;
}

export const STARTERS: readonly Starter[] = [
  {
    name: "Hello circle",
    code: `import { background, circle, fill } from 'matter/draw';
import { screen, time } from 'matter/scene';

return {
  draw() {
    background('oklch(0.15 0.02 260)');
    fill('oklch(0.72 0.18 250)');
    circle(
      screen.width / 2,
      screen.height / 2,
      180 + Math.sin(time.elapsed * 2) * 70,
    );
  },
};`,
  },
  {
    name: "Noise field",
    code: `import { background, circle, fill } from 'matter/draw';
import { noise, random, screen, time } from 'matter/scene';

const points = Array.from({ length: 2500 }, () => ({
  x: random.range(0, screen.width),
  y: random.range(0, screen.height),
}));

return {
  draw() {
    // A translucent background fades the last frame instead of clearing it.
    background('oklch(0.12 0.02 265 / 0.08)');

    for (const p of points) {
      const a = noise.noise3(p.x * 0.003, p.y * 0.003, time.elapsed * 0.1) * Math.PI * 3;
      p.x = (p.x + Math.cos(a) * 1.5 + screen.width) % screen.width;
      p.y = (p.y + Math.sin(a) * 1.5 + screen.height) % screen.height;
      fill('oklch(0.8 0.14 210 / 0.35)');
      circle(p.x, p.y, 2);
    }
  },
};`,
  },
  {
    name: "Input edges",
    code: `import { background, circle, fill } from 'matter/draw';
import { input, keyIsDown, keyJustPressed, pointerJustPressed } from 'matter/input';
import { screen } from 'matter/scene';

const player = { x: screen.width / 2, y: screen.height / 2 };
let hue = 285;
let size = 72;

return {
  update(dt) {
    if (keyIsDown('ArrowLeft')) player.x -= 240 * dt;
    if (keyIsDown('ArrowRight')) player.x += 240 * dt;
    if (keyIsDown('ArrowUp')) player.y -= 240 * dt;
    if (keyIsDown('ArrowDown')) player.y += 240 * dt;

    // One change per press, even when the browser repeats the keydown event.
    if (keyJustPressed(' ')) hue = (hue + 55) % 360;
    // Pointer Events covers mouse, pen, and touch through the same edge.
    if (pointerJustPressed()) {
      player.x = input.mouseX;
      player.y = input.mouseY;
    }
    size = Math.max(24, Math.min(160, size - input.wheelY * 0.25));
  },
  draw() {
    background('oklch(0.14 0.02 260)');
    fill(\`oklch(0.72 0.18 \${hue})\`);
    circle(player.x, player.y, size);
  },
};`,
  },
  {
    name: "Dungeon run",
    code: DUNGEON_RUN[0]?.code ?? "",
    files: DUNGEON_RUN,
  },
  {
    name: "Transform stack",
    code: `import { background, fill, pop, push, rect, rotate, translate } from 'matter/draw';
import { screen, time } from 'matter/scene';

return {
  draw() {
    background('oklch(0.97 0.01 90)');
    push();
    translate(screen.width / 2, screen.height / 2);

    for (let ring = 1; ring <= 6; ring++) {
      push();
      rotate(time.elapsed * 0.3 / ring * (ring % 2 ? 1 : -1));
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
    code: `import { background, circle, fill, scoped } from 'matter/draw';
import { screen } from 'matter/scene';

// scoped() restores style and transform even if the body throws.
return {
  draw() {
    background('oklch(0.96 0.01 80)');
    fill('oklch(0.55 0.2 25)');

    scoped({ fill: 'oklch(0.6 0.16 200)', stroke: 'white', strokeWeight: 6 }, () => {
      circle(screen.width / 2 - 90, screen.height / 2, 160);
    });

    // Back to the red fill, and no stroke.
    circle(screen.width / 2 + 90, screen.height / 2, 160);
  },
};`,
  },
  {
    name: "Rigid bodies",
    code: `import { background, circle, fill, pop, push, rect, rotate, translate } from 'matter/draw';
import { input, pointerJustPressed } from 'matter/input';
import { Shape } from 'matter/physics';
import { random, screen } from 'matter/scene';

const { physics, overlay } = s;
overlay.visible = true;
const world = physics.world;
world.gravityY = 1600;

world.addBox({
  x: screen.width / 2,
  y: screen.height - 12,
  width: screen.width,
  height: 24,
  isStatic: true,
  friction: 0.7,
});
world.addBox({ x: 8, y: screen.height / 2, width: 16, height: screen.height, isStatic: true });
world.addBox({
  x: screen.width - 8,
  y: screen.height / 2,
  width: 16,
  height: screen.height,
  isStatic: true,
});

for (let i = 0; i < 8; i++) {
  world.addBox({
    x: 220 + (i % 3) * 46,
    y: 80 + Math.floor(i / 3) * 36,
    width: 40,
    height: 28,
    angle: (i - 3) * 0.08,
    restitution: 0.12,
    friction: 0.55,
  });
}

return {
  update() {
    if (pointerJustPressed()) {
      world.addCircle({
        x: input.mouseX,
        y: input.mouseY,
        radius: random.range(8, 16),
        restitution: 0.6,
      });
    }
  },
  draw() {
    background('oklch(0.14 0.03 250)');
    for (const body of world.bodies) {
      fill(body.isStatic ? 'oklch(0.28 0.03 250)' : body.shape === Shape.Circle
        ? 'oklch(0.78 0.16 230)'
        : 'oklch(0.74 0.14 55)');
      if (body.shape === Shape.Circle) {
        circle(body.x, body.y, body.radius * 2);
      } else {
        push();
        translate(body.x, body.y);
        rotate(body.angle);
        rect(-body.width / 2, -body.height / 2, body.width, body.height);
        pop();
      }
    }
  },
};`,
  },
  {
    name: "Pathfind",
    code: `import { background, circle, fill, noStroke, rect } from 'matter/draw';
import { input, pointerJustPressed } from 'matter/input';
import { pathfind } from 'matter/math';
import { screen } from 'matter/scene';

const COLS = 20;
const ROWS = 20;
const tile = screen.width / COLS;
const map = pathfind.grid(COLS, ROWS);
const walls = [
  [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [4, 8],
  [8, 11], [9, 11], [10, 11], [11, 11], [12, 11], [12, 10], [12, 9],
  [15, 3], [15, 4], [15, 5], [16, 5], [17, 5],
];
for (const [c, r] of walls) map.set(c, r, 0);

let startC = 1;
let startR = 1;
let goalC = 18;
let goalR = 16;
const route = pathfind.createPath();
pathfind.astar(map, startC, startR, goalC, goalR, { out: route });

return {
  update() {
    if (!pointerJustPressed()) return;
    const c = Math.floor(input.mouseX / tile);
    const r = Math.floor(input.mouseY / tile);
    if (map.cost(c, r) <= 0) return;
    goalC = c;
    goalR = r;
    pathfind.astar(map, startC, startR, goalC, goalR, { out: route });
  },
  draw() {
    background('oklch(0.16 0.02 250)');
    noStroke();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        fill(map.cost(c, r) <= 0 ? 'oklch(0.30 0.03 250)' : 'oklch(0.22 0.02 250)');
        rect(c * tile + 1, r * tile + 1, tile - 2, tile - 2);
      }
    }
    fill('oklch(0.72 0.16 145 / 0.55)');
    for (let i = 0; i < route.length; i++) {
      const c = route.points[i * 2];
      const r = route.points[i * 2 + 1];
      rect(c * tile + 6, r * tile + 6, tile - 12, tile - 12);
    }
    fill('oklch(0.78 0.16 230)');
    circle((startC + 0.5) * tile, (startR + 0.5) * tile, tile * 0.7);
    fill('oklch(0.78 0.16 40)');
    circle((goalC + 0.5) * tile, (goalR + 0.5) * tile, tile * 0.7);
  },
};`,
  },
  {
    name: "Text",
    code: `import { Align, Baseline, background, fill, text, textAlign, textFont, textSize } from 'matter/draw';
import { screen, time } from 'matter/scene';

return {
  draw() {
    background('oklch(0.16 0.03 265)');
    textFont('Bricolage Grotesque, sans-serif');
    textAlign(Align.Center, Baseline.Middle);

    for (let i = 0; i < 5; i++) {
      fill(\`oklch(\${0.5 + i * 0.09} 0.15 \${200 + i * 22})\`);
      textSize(20 + i * 14);
      text('Matter', screen.width / 2, 110 + i * 90 + Math.sin(time.elapsed + i) * 8);
    }
  },
};`,
  },
];
