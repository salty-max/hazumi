/**
 * A bike over bumps, built out of the solver rather than animated.
 *
 * Nothing here is scripted. The bike is a chassis with two wheels pinned to
 * it, the throttle is a torque on the rear wheel, leaning is a torque on the
 * chassis, and the jumps are whatever the ground does to a wheel travelling
 * at speed. Landing badly is landing badly.
 *
 * The track is a heightfield turned into rotated static boxes, one per
 * segment, overlapping so a wheel cannot catch in a seam. Bumps grow as you
 * go: the first are rideable at any speed, the last need the front wheel up.
 *
 * Right to accelerate, left to brake and reverse, up and down to lean, R to
 * start over.
 */
import { createPluginHost, start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Align,
  background,
  circle,
  fill,
  line,
  noStroke,
  pop,
  push,
  rect,
  rotate,
  stroke,
  strokeWeight,
  text,
  textAlign,
  textSize,
  translate,
} from "hazumi/draw";
import { keyIsDown, keyJustPressed } from "hazumi/input";
import { physics, type PhysicsApi, type RigidBody, type World } from "hazumi/physics";
import { camera, screen } from "hazumi/scene";

const TRACK_LENGTH = 3000;
const SEGMENT = 40;
const GROUND_Y = 430;
const START_X = 120;

const WHEEL_RADIUS = 15;
const AXLE_X = 26;
const AXLE_Y = 9;

/** Ground height at a point, with bumps that grow along the track. */
function height(x: number): number {
  if (x < 320) return GROUND_Y;
  const along = (x - 320) / (TRACK_LENGTH - 320);
  // Amplitude ramps from a ripple to something that needs committing to.
  const amplitude = 6 + along * 40;
  const wavelength = 230 - along * 30;
  const bump = Math.sin(((x - 320) / wavelength) * Math.PI * 2);
  // Squared and signed keeps the troughs shallow and the crests sharp, which
  // is what makes a jump out of a bump.
  return GROUND_Y - Math.sign(bump) * bump * bump * amplitude;
}

interface Bike {
  readonly chassis: RigidBody;
  readonly rear: RigidBody;
  readonly front: RigidBody;
}

function buildBike(world: World, x: number): Bike {
  const chassis = world.addBox({
    x,
    y: height(x) - 46,
    width: 68,
    height: 14,
    density: 1.2,
    friction: 0.3,
    restitution: 0,
    angularDamping: 0.4,
  });
  const wheel = (offset: number): RigidBody =>
    world.addCircle({
      x: x + offset,
      y: height(x) - 46 + AXLE_Y,
      radius: WHEEL_RADIUS,
      density: 1,
      friction: 1.1,
      restitution: 0.05,
      angularDamping: 0.05,
    });
  const rear = wheel(-AXLE_X);
  const front = wheel(AXLE_X);
  // A pin holds the axle and leaves the wheel free to turn, which is what an
  // axle is. No suspension: this bike is as rigid as its frame.
  world.addPinJoint({ a: chassis, b: rear, anchorAX: -AXLE_X, anchorAY: AXLE_Y });
  world.addPinJoint({ a: chassis, b: front, anchorAX: AXLE_X, anchorAY: AXLE_Y });
  return { chassis, rear, front };
}

export function bike(parent: HTMLElement): HazumiApp<PhysicsApi> {
  return start(
    {
      backend: webgl2(),
      width: 600,
      height: 600,
      parent,
      plugins: createPluginHost().use(physics({ gravityY: 2000 })),
    },
    ({ physics: sim }) => {
      const world = sim.world;

      // One box per segment, turned onto the slope and sunk below it. They
      // overlap by a segment's width so a wheel never meets an open corner.
      for (let x = 0; x < TRACK_LENGTH; x += SEGMENT) {
        const y0 = height(x);
        const y1 = height(x + SEGMENT);
        const angle = Math.atan2(y1 - y0, SEGMENT);
        // Sunk along the slab's own down, not the world's: offsetting a
        // rotated box vertically slides its face sideways, and the step that
        // leaves between one slab and the next stops a wheel dead.
        world.addBox({
          x: x + SEGMENT / 2 - Math.sin(angle) * 70,
          y: (y0 + y1) / 2 + Math.cos(angle) * 70,
          width: Math.hypot(SEGMENT, y1 - y0) * 1.02,
          height: 140,
          angle,
          isStatic: true,
          friction: 0.9,
        });
      }

      let rider = buildBike(world, START_X);
      let best = 0;
      let airborne = 0;
      let longestAir = 0;
      let stuckFor = 0;

      function restart(): void {
        for (const body of [rider.chassis, rider.rear, rider.front]) world.remove(body);
        rider = buildBike(world, START_X);
        airborne = 0;
        stuckFor = 0;
      }

      return {
        update(dt: number): void {
          if (keyJustPressed("r") || keyJustPressed("R")) restart();

          const { chassis, rear, front } = rider;
          if (keyIsDown("ArrowRight")) world.applyTorque(rear, 60_000_000);
          if (keyIsDown("ArrowLeft")) world.applyTorque(rear, -30_000_000);
          // Leaning only bites in the air, where there is no ground to push
          // against — same as the game this borrows from.
          if (keyIsDown("ArrowUp")) world.applyTorque(chassis, -14_000_000);
          if (keyIsDown("ArrowDown")) world.applyTorque(chassis, 14_000_000);

          const clearance = Math.min(
            height(rear.x) - rear.y - WHEEL_RADIUS,
            height(front.x) - front.y - WHEEL_RADIUS,
          );
          if (clearance > 6) {
            airborne += dt;
            longestAir = Math.max(longestAir, airborne);
          } else {
            airborne = 0;
          }

          best = Math.max(best, chassis.x - START_X);

          // Landed on its back, or going nowhere: pick it up rather than leave
          // a wreck on screen, since this scene plays itself in the gallery.
          const beached = Math.abs(chassis.angle) > 1.4 || Math.hypot(chassis.vx, chassis.vy) < 12;
          stuckFor = beached ? stuckFor + dt : 0;
          if (stuckFor > 1.6) restart();
          // Off the end, or fallen through the world: start again.
          if (chassis.x > TRACK_LENGTH - 200 || chassis.y > GROUND_Y + 400) restart();
        },
        draw(): void {
          background("oklch(0.16 0.03 250)");
          const { chassis, rear, front } = rider;
          camera.follow(chassis.x + 90, GROUND_Y - 60, 0.08);

          // The ground as its own outline, sampled rather than read back from
          // the bodies: one line reads as a track, forty boxes do not.
          stroke("oklch(0.42 0.05 250)");
          strokeWeight(3);
          const left = chassis.x - 400;
          for (let x = left; x < left + 900; x += SEGMENT / 2) {
            line(x, height(x), x + SEGMENT / 2, height(x + SEGMENT / 2));
          }
          noStroke();

          fill("oklch(0.72 0.14 250)");
          push();
          translate(chassis.x, chassis.y);
          rotate(chassis.angle);
          rect(-chassis.width / 2, -chassis.height / 2, chassis.width, chassis.height);
          // A rider, so which way it is leaning is readable at a glance.
          fill("oklch(0.85 0.16 60)");
          rect(-6, -26, 14, 20);
          pop();

          for (const wheel of [rear, front]) {
            fill("oklch(0.80 0.03 250)");
            circle(wheel.x, wheel.y, wheel.radius * 2);
            // A spoke: without it a rolling wheel and a sliding one look alike.
            stroke("oklch(0.35 0.04 250)");
            strokeWeight(2);
            line(
              wheel.x,
              wheel.y,
              wheel.x + Math.cos(wheel.angle) * wheel.radius,
              wheel.y + Math.sin(wheel.angle) * wheel.radius,
            );
            noStroke();
          }

          camera.screen(() => {
            fill("oklch(0.9 0.02 250)");
            textSize(13);
            textAlign(Align.Left);
            const speed = Math.round(Math.hypot(chassis.vx, chassis.vy));
            text(`${speed} u/s · ${Math.round(best)} travelled`, 14, 24);
            text(`air ${airborne.toFixed(2)}s · best ${longestAir.toFixed(2)}s`, 14, 42);
            textAlign(Align.Center);
            text(
              "→ throttle · ← brake · ↑↓ lean in the air · R to restart",
              screen.width / 2,
              screen.height - 18,
            );
            textAlign(Align.Left);
          });
        },
      };
    },
  );
}
