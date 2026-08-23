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
  beginShape,
  circle,
  endShape,
  fill,
  line,
  noFill,
  noStroke,
  pop,
  push,
  rotate,
  stroke,
  strokeWeight,
  text,
  textAlign,
  textSize,
  translate,
  vertex,
} from "hazumi/draw";
import { keyIsDown, keyJustPressed } from "hazumi/input";
import { physics, type PhysicsApi, type RigidBody, type World } from "hazumi/physics";
import { camera, screen } from "hazumi/scene";

const TRACK_LENGTH = 3000;
const SEGMENT = 40;
const GROUND_Y = 430;
const START_X = 120;

const WHEEL_RADIUS = 15;
const AXLE_X = 31;
const AXLE_Y = 9;
/** Where the swingarm hinges, and how far above the axle the spring pulls. */
const PIVOT_X = 6;
const SPRING_TOP = 16;

/** Ground height at a point, with bumps that grow along the track. */
function height(x: number): number {
  if (x < 320) return GROUND_Y;
  const along = (x - 320) / (TRACK_LENGTH - 320);
  // Amplitude ramps from a ripple to something that needs committing to.
  const amplitude = 6 + along * 24;
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
    width: 76,
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

  // Suspension out of two joints and no extra bodies. The rigid one is a
  // swingarm: it holds the wheel a fixed distance from a pivot near the
  // middle of the frame, so the wheel can only travel along an arc. The soft
  // one is the spring and damper across that arc. Pin the wheel straight to
  // the frame instead and every bump arrives at the rider intact.
  for (const [side, wheelBody] of [
    [-1, rear],
    [1, front],
  ] as const) {
    world.addDistanceJoint({
      a: chassis,
      b: wheelBody,
      anchorAX: side * PIVOT_X,
      anchorAY: AXLE_Y,
      length: AXLE_X - PIVOT_X,
    });
    world.addDistanceJoint({
      a: chassis,
      b: wheelBody,
      anchorAX: side * AXLE_X,
      anchorAY: -SPRING_TOP,
      length: SPRING_TOP + AXLE_Y,
      stiffness: 6,
      damping: 0.9,
    });
  }
  return { chassis, rear, front };
}

const TYRE = "oklch(0.24 0.02 260)";
const RIM = "oklch(0.80 0.02 260)";
const HUB = "oklch(0.52 0.02 260)";
const METAL = "oklch(0.68 0.02 260)";
const BODY = "oklch(0.62 0.20 28)";
const ENGINE = "oklch(0.36 0.02 260)";
const SUIT = "oklch(0.40 0.06 255)";
const HELMET = "oklch(0.88 0.16 88)";
const GROUND_FILL = "oklch(0.21 0.02 250)";
const GROUND_EDGE = "oklch(0.55 0.06 250)";

/** A point given in the chassis's own frame, in world coordinates. */
function onFrame(chassis: RigidBody, lx: number, ly: number, out: { x: number; y: number }): void {
  const c = Math.cos(chassis.angle);
  const s = Math.sin(chassis.angle);
  out.x = chassis.x + c * lx - s * ly;
  out.y = chassis.y + s * lx + c * ly;
}

const HEAD = { x: 0, y: 0 };
const PIVOT = { x: 0, y: 0 };

function drawWheel(wheel: RigidBody): void {
  noFill();
  stroke(TYRE);
  strokeWeight(6);
  circle(wheel.x, wheel.y, wheel.radius * 2 - 3);
  stroke(RIM);
  strokeWeight(2);
  circle(wheel.x, wheel.y, wheel.radius * 1.25);
  // Spokes turn with the body, which is the difference between a wheel that
  // rolls and one that slides.
  strokeWeight(1.5);
  for (let i = 0; i < 6; i++) {
    const a = wheel.angle + (i * Math.PI) / 6;
    const r = wheel.radius * 0.6;
    line(
      wheel.x - Math.cos(a) * r,
      wheel.y - Math.sin(a) * r,
      wheel.x + Math.cos(a) * r,
      wheel.y + Math.sin(a) * r,
    );
  }
  noStroke();
  fill(HUB);
  circle(wheel.x, wheel.y, 6);
}

function drawBike(rider: Bike): void {
  const { chassis, rear, front } = rider;
  drawWheel(rear);
  drawWheel(front);

  // Swingarm and fork are drawn to where the wheels actually are, so the
  // suspension working is something you can see rather than infer. A long
  // raked fork is most of a motocrosser's stance.
  stroke(METAL);
  strokeWeight(5);
  onFrame(chassis, -PIVOT_X, AXLE_Y, PIVOT);
  line(PIVOT.x, PIVOT.y, rear.x, rear.y);
  onFrame(chassis, AXLE_X - 9, -20, HEAD);
  strokeWeight(5);
  line(HEAD.x, HEAD.y, front.x, front.y);
  noStroke();

  push();
  translate(chassis.x, chassis.y);
  rotate(chassis.angle);

  // Frame: a short, tall triangle with plenty of air under it.
  stroke(METAL);
  strokeWeight(3);
  line(20, -21, -2, -1);
  line(-2, -1, -10, -18);
  line(20, -21, -10, -18);
  line(-10, -18, -26, -19);
  noStroke();

  fill(ENGINE);
  beginShape();
  vertex(2, -11);
  vertex(12, -13);
  vertex(13, -3);
  vertex(3, -1);
  endShape(true);

  fill(BODY);
  // Shrouds, tank, seat and the kicked-up tail in one run: separate pieces
  // read as loose planks at the size this is actually seen at.
  beginShape();
  vertex(22, -25);
  vertex(12, -27);
  vertex(-6, -27);
  vertex(-22, -24);
  vertex(-30, -27);
  vertex(-35, -28);
  vertex(-34, -24);
  vertex(-26, -20);
  vertex(-8, -18);
  vertex(4, -16);
  vertex(16, -14);
  vertex(23, -17);
  endShape(true);
  // Front fender: pointed and high, but no longer than the wheel it covers.
  beginShape();
  vertex(23, -29);
  vertex(33, -33);
  vertex(37, -31);
  vertex(27, -26);
  endShape(true);

  stroke(METAL);
  strokeWeight(3);
  line(21, -25, 26, -34);
  strokeWeight(2.5);
  line(21, -36, 31, -33);
  noStroke();

  // Rider, standing on the pegs: knees bent, hips back, chest over the bars.
  // A trailing back leg and a straight arm are what read as motocross.
  stroke(SUIT);
  strokeWeight(7);
  line(-6, -30, 2, -20);
  line(2, -20, -4, -11);
  strokeWeight(8);
  line(-6, -31, 12, -42);
  strokeWeight(5);
  line(12, -42, 25, -34);
  noStroke();
  fill(HELMET);
  circle(16, -47, 14);
  fill(ENGINE);
  beginShape();
  vertex(19, -48);
  vertex(23, -46);
  vertex(18, -43);
  endShape(true);
  // Peak, angled down the way a motocross helmet's is. Level and long, it
  // reads as a beak.
  fill(HELMET);
  beginShape();
  vertex(19, -52);
  vertex(27, -50);
  vertex(26, -46);
  vertex(19, -48);
  endShape(true);

  pop();
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
          if (keyIsDown("ArrowRight")) world.applyTorque(rear, 20_000_000);
          if (keyIsDown("ArrowLeft")) world.applyTorque(rear, -12_000_000);
          // Leaning only bites in the air, where there is no ground to push
          // against — same as the game this borrows from.
          if (keyIsDown("ArrowUp")) world.applyTorque(chassis, -5_000_000);
          if (keyIsDown("ArrowDown")) world.applyTorque(chassis, 5_000_000);

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
          const { chassis } = rider;
          camera.follow(chassis.x + 90, GROUND_Y - 60, 0.08);

          // The ground as a filled mass with a lit edge, sampled rather than
          // read back from the bodies: one shape reads as a track, forty boxes
          // do not — and a solid ground is what a silhouette needs to sit on.
          const left = chassis.x - 400;
          const right = left + 900;
          fill(GROUND_FILL);
          beginShape();
          for (let x = left; x <= right; x += SEGMENT / 2) vertex(x, height(x));
          vertex(right, GROUND_Y + 400);
          vertex(left, GROUND_Y + 400);
          endShape(true);
          stroke(GROUND_EDGE);
          strokeWeight(2);
          for (let x = left; x < right; x += SEGMENT / 2) {
            line(x, height(x), x + SEGMENT / 2, height(x + SEGMENT / 2));
          }
          noStroke();

          drawBike(rider);

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
