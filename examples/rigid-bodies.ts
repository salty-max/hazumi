/**
 * Impulse-based rigid bodies next to the AABB query kit.
 * Tests: gravity, oriented boxes, bouncing circles, click-to-spawn, rotation.
 */
import { start, type MatterApp } from "matter/app";
import { webgl2 } from "matter/backends/webgl2";
import { background, circle, fill, pop, push, rect, rotate, translate } from "matter/draw";
import { input, pointerJustPressed } from "matter/input";
import { physics } from "matter/math";
import { random, screen } from "matter/scene";

const MAX_DYNAMIC = 64;

function cull(world: physics.World): void {
  let dynamic = 0;
  for (let i = 0; i < world.bodies.length; i++) {
    if (world.bodies[i]?.isStatic === false) dynamic++;
  }
  if (dynamic < MAX_DYNAMIC) return;
  for (let i = 0; i < world.bodies.length; i++) {
    const body = world.bodies[i];
    if (body !== undefined && !body.isStatic) {
      world.remove(body);
      return;
    }
  }
}

export function rigidBodies(parent: HTMLElement): MatterApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 11 }, () => {
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

    for (let i = 0; i < 9; i++) {
      world.addBox({
        x: 210 + (i % 3) * 44,
        y: 70 + Math.floor(i / 3) * 38,
        width: 38,
        height: 28,
        angle: (i - 4) * 0.07,
        restitution: 0.12,
        friction: 0.55,
      });
    }
    for (let i = 0; i < 6; i++) {
      world.addCircle({
        x: 430 + i * 6,
        y: 50 + i * 10,
        radius: 16 - i,
        restitution: 0.72,
      });
    }

    return {
      update(dt: number): void {
        if (pointerJustPressed()) {
          cull(world);
          if (random.bool()) {
            world.addCircle({
              x: input.mouseX,
              y: input.mouseY,
              radius: random.range(8, 18),
              restitution: 0.55,
            });
          } else {
            world.addBox({
              x: input.mouseX,
              y: input.mouseY,
              width: random.range(18, 40),
              height: random.range(16, 32),
              angle: random.range(-0.5, 0.5),
              restitution: 0.18,
              friction: 0.5,
            });
          }
        }
        world.step(dt);
      },
      draw(): void {
        background("oklch(0.14 0.03 250)");
        for (let i = 0; i < world.bodies.length; i++) {
          const body = world.bodies[i];
          if (body === undefined) continue;
          if (body.isStatic) {
            fill("oklch(0.28 0.03 250)");
          } else if (body.shape === physics.Shape.Circle) {
            fill("oklch(0.78 0.16 230)");
          } else {
            fill("oklch(0.74 0.14 55)");
          }
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
    };
  });
}
