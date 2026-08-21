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
import { physics } from 'matter/math';
import { random, screen } from 'matter/scene';

const world = physics.world({ gravityY: 1600 });
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
  update(dt) {
    if (pointerJustPressed()) {
      world.addCircle({
        x: input.mouseX,
        y: input.mouseY,
        radius: random.range(8, 16),
        restitution: 0.6,
      });
    }
    world.step(dt);
  },
  draw() {
    background('oklch(0.14 0.03 250)');
    for (const body of world.bodies) {
      fill(body.isStatic ? 'oklch(0.28 0.03 250)' : body.shape === physics.Shape.Circle
        ? 'oklch(0.78 0.16 230)'
        : 'oklch(0.74 0.14 55)');
      if (body.shape === physics.Shape.Circle) {
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
