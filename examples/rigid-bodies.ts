/**
 * Impulse-based rigid bodies next to the AABB query kit.
 *
 * The scene is built to show the parts that are easy to get wrong: a seven-box
 * tower that has to still be a tower a minute later, a fast projectile that has
 * to stop at a wall thinner than the distance it covers in one step, and bodies
 * that go quiet and stay quiet. Sleeping crates are drawn dimmer, so what the
 * solver is actually working on is visible without opening the overlay.
 *
 * Tests: gravity, oriented boxes, bouncing circles, click-to-spawn, rotation,
 * the physics host stepping on the fixed clock, and the debug overlay.
 */
import { createPluginHost, start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { overlay, type OverlayApi } from "hazumi/debug";
import {
  Align,
  background,
  circle,
  fill,
  pop,
  push,
  rect,
  rotate,
  text,
  textAlign,
  textSize,
  translate,
} from "hazumi/draw";
import { input, keyIsDown, pointerJustPressed } from "hazumi/input";
import { physics, Shape, type PhysicsApi, type World } from "hazumi/physics";
import { random, screen } from "hazumi/scene";

const MAX_DYNAMIC = 64;

function cull(world: World): void {
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

export function rigidBodies(parent: HTMLElement): HazumiApp<PhysicsApi & OverlayApi> {
  return start(
    {
      backend: webgl2(),
      width: 600,
      height: 600,
      parent,
      seed: 11,
      plugins: createPluginHost()
        // A little damping on everything: without it a nudged crate slides
        // until it meets something, which reads as ice rather than as wood.
        .use(physics({ gravityY: 1600, linearDamping: 0.2, angularDamping: 0.6 }))
        .use(overlay({ toggleKey: "F1" })),
    },
    ({ physics: sim }) => {
      const world = sim.world;
      world.addBox({
        x: screen.width / 2,
        y: screen.height - 12,
        width: screen.width,
        height: 24,
        isStatic: true,
        friction: 0.7,
      });
      world.addBox({
        x: 8,
        y: screen.height / 2,
        width: 16,
        height: screen.height,
        isStatic: true,
      });
      world.addBox({
        x: screen.width - 8,
        y: screen.height / 2,
        width: 16,
        height: screen.height,
        isStatic: true,
      });

      // A tower rather than a heap: a stack is the scene that falls over when
      // the solver corrects velocities the bodies have already spent.
      for (let i = 0; i < 7; i++) {
        world.addBox({
          x: 190,
          y: screen.height - 38 - i * 30,
          width: 46 - i * 3,
          height: 28,
          restitution: 0.05,
          friction: 0.7,
        });
      }
      for (let i = 0; i < 4; i++) {
        world.addBox({
          x: 330 + (i % 2) * 44,
          y: 90 + Math.floor(i / 2) * 38,
          width: 38,
          height: 28,
          angle: (i - 2) * 0.09,
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
        update(): void {
          if (pointerJustPressed()) {
            cull(world);
            if (keyIsDown("Shift")) {
              // 2400 units a second is 40 units a step, against walls 16 wide.
              // Nothing but a contact found before the shapes touch keeps this
              // inside the room.
              world.addCircle({
                x: 40,
                y: input.mouseY,
                radius: 7,
                vx: 2400,
                restitution: 0.5,
                friction: 0.3,
              });
            } else if (random.bool()) {
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
        },
        draw(): void {
          background("oklch(0.14 0.03 250)");
          let awake = 0;
          for (let i = 0; i < world.bodies.length; i++) {
            const body = world.bodies[i];
            if (body === undefined) continue;
            if (!body.isStatic && body.isAwake) awake++;
            if (body.isStatic) {
              fill("oklch(0.28 0.03 250)");
            } else if (body.shape === Shape.Circle) {
              // Asleep is drawn as asleep. A body the solver has stopped
              // touching should not look identical to one it is still holding.
              fill(body.isAwake ? "oklch(0.78 0.16 230)" : "oklch(0.5 0.07 230)");
            } else {
              fill(body.isAwake ? "oklch(0.74 0.14 55)" : "oklch(0.48 0.06 55)");
            }
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

          // Along the top: everything settles at the bottom, and a caption over
          // a resting stack is a caption nobody can read.
          fill("oklch(0.9 0.02 250)");
          textSize(13);
          textAlign(Align.Center);
          text(
            `${world.bodies.length} bodies · ${awake} awake · click to drop, shift-click to fire`,
            screen.width / 2,
            30,
          );
          textAlign(Align.Left);
        },
      };
    },
  );
}
