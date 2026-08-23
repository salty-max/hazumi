import { describe, expect, test } from "bun:test";
import { createRayHit } from "../src/collision";
import { physics } from "../src/index";

function step(world: physics.World, times: number, dt = 1 / 60): void {
  for (let i = 0; i < times; i++) world.step(dt);
}

describe("world construction", () => {
  test("starts empty with downward gravity", () => {
    const world = physics.world();
    expect(world.bodies).toEqual([]);
    expect(world.gravityY).toBe(980);
  });

  test("rejects shapes that cannot exist", () => {
    const world = physics.world();
    expect(() => world.addCircle({ x: 0, y: 0, radius: 0 })).toThrow(RangeError);
    expect(() => world.addBox({ x: 0, y: 0, width: -1, height: 4 })).toThrow(RangeError);
  });

  test("static bodies have no inverse mass", () => {
    const body = physics.world().addBox({ x: 0, y: 0, width: 10, height: 10, isStatic: true });
    expect(body.invMass).toBe(0);
    expect(body.isStatic).toBe(true);
  });
});

describe("integration", () => {
  test("gravity increases downward velocity", () => {
    const world = physics.world({ gravityX: 0, gravityY: 100 });
    const ball = world.addCircle({ x: 0, y: 0, radius: 8 });
    world.step(0.1);
    expect(ball.vy).toBeCloseTo(10);
    expect(ball.y).toBeCloseTo(1);
  });

  test("a zero or non-finite step is a no-op", () => {
    const world = physics.world();
    const ball = world.addCircle({ x: 3, y: 4, radius: 2, vy: 9 });
    world.step(0);
    world.step(-1);
    world.step(Number.NaN);
    expect(ball.y).toBe(4);
    expect(ball.vy).toBe(9);
  });

  test("an impulse at the centre changes linear velocity only", () => {
    const world = physics.world({ gravityY: 0 });
    const ball = world.addCircle({ x: 0, y: 0, radius: 10, density: 1 / Math.PI });
    world.applyImpulse(ball, 5, 0);
    expect(ball.vx).toBeCloseTo(5 / ball.mass);
    expect(ball.omega).toBe(0);
  });

  test("an offset impulse produces spin", () => {
    const world = physics.world({ gravityY: 0 });
    const box = world.addBox({ x: 0, y: 0, width: 20, height: 20 });
    world.applyImpulse(box, 0, 10, 10, 0);
    expect(box.omega).not.toBe(0);
  });
});

describe("circle collisions", () => {
  test("a falling circle rests on a static floor", () => {
    const world = physics.world({ gravityY: 800 });
    world.addBox({ x: 0, y: 100, width: 400, height: 20, isStatic: true });
    const ball = world.addCircle({ x: 0, y: 0, radius: 10 });
    step(world, 180);
    // Floor top is y=90; the ball's bottom should sit there, not fall through.
    expect(ball.y + ball.radius).toBeLessThan(91);
    expect(ball.y + ball.radius).toBeGreaterThan(88);
    expect(Math.abs(ball.vy)).toBeLessThan(1);
  });

  test("overlapping circles separate along the join", () => {
    const world = physics.world({ gravityY: 0 });
    const left = world.addCircle({ x: 0, y: 0, radius: 10 });
    const right = world.addCircle({ x: 6, y: 0, radius: 10 });
    step(world, 30);
    expect(right.x - left.x).toBeGreaterThan(19);
  });

  test("restitution reverses a fast impact", () => {
    const world = physics.world({ gravityY: 0 });
    world.addBox({ x: 0, y: 50, width: 200, height: 10, isStatic: true, restitution: 1 });
    const ball = world.addCircle({
      x: 0,
      y: 0,
      radius: 8,
      vy: 200,
      restitution: 1,
    });
    step(world, 40);
    expect(ball.vy).toBeLessThan(-50);
  });
});

describe("resting contact", () => {
  test("a box on a floor does not keep bouncing", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 100, width: 400, height: 20, isStatic: true, friction: 0.6 });
    const crate = world.addBox({ x: 0, y: 0, width: 32, height: 24, friction: 0.6 });
    step(world, 180);
    let maxSpeed = 0;
    for (let i = 0; i < 60; i++) {
      world.step(1 / 60);
      maxSpeed = Math.max(maxSpeed, Math.abs(crate.vx), Math.abs(crate.vy), Math.abs(crate.omega));
    }
    expect(maxSpeed).toBeLessThan(0.01);
    expect(crate.y + crate.height / 2).toBeLessThan(91);
    expect(crate.y + crate.height / 2).toBeGreaterThan(88);
  });

  test("a two-box stack stays put", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 120, width: 400, height: 20, isStatic: true, friction: 0.5 });
    const lower = world.addBox({ x: 0, y: 80, width: 40, height: 20, friction: 0.5 });
    const upper = world.addBox({ x: 4, y: 40, width: 36, height: 20, friction: 0.5 });
    step(world, 240);
    let maxSpeed = 0;
    for (let i = 0; i < 60; i++) {
      world.step(1 / 60);
      maxSpeed = Math.max(
        maxSpeed,
        Math.abs(lower.vy),
        Math.abs(upper.vy),
        Math.abs(lower.omega),
        Math.abs(upper.omega),
      );
    }
    expect(maxSpeed).toBeLessThan(0.05);
    expect(upper.y).toBeLessThan(lower.y);
  });
});

describe("contacts", () => {
  test("a dense pile still steps without dropping the extra pairs", () => {
    const world = physics.world({ gravityY: 0 });
    for (let i = 0; i < 120; i++) {
      world.addCircle({ x: (i % 10) * 6, y: Math.floor(i / 10) * 6, radius: 8 });
    }
    expect(() => world.step(1 / 60)).not.toThrow();
    expect(world.bodies).toHaveLength(120);
  });
});

describe("oriented boxes", () => {
  test("a rotated box still sits on a floor", () => {
    const world = physics.world({ gravityY: 900 });
    world.addBox({ x: 0, y: 80, width: 300, height: 16, isStatic: true });
    const crate = world.addBox({
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      angle: Math.PI / 8,
    });
    step(world, 240);
    expect(crate.y).toBeGreaterThan(40);
    expect(crate.y).toBeLessThan(80);
    expect(Math.abs(crate.vy)).toBeLessThan(1);
    expect(Number.isFinite(crate.angle)).toBe(true);
  });

  test("two boxes colliding off-axis produce rotation", () => {
    const world = physics.world({ gravityY: 0 });
    const moving = world.addBox({ x: 0, y: 0, width: 20, height: 20, vx: 80 });
    world.addBox({ x: 40, y: 6, width: 20, height: 20, isStatic: true });
    step(world, 40);
    // The angle, not the angular velocity: the box comes to rest and falls
    // asleep within these 40 steps, and sleeping zeroes velocity by design.
    // What has to survive is that the impact turned it.
    expect(moving.angle).not.toBe(0);
    expect(moving.x).toBeLessThan(40);
  });
});

describe("friction and bookkeeping", () => {
  test("friction slows a box sliding on a floor", () => {
    const world = physics.world({ gravityY: 900 });
    world.addBox({ x: 0, y: 40, width: 400, height: 12, isStatic: true, friction: 0.8 });
    const crate = world.addBox({
      x: 0,
      y: 0,
      width: 20,
      height: 12,
      vx: 120,
      friction: 0.8,
    });
    step(world, 180);
    expect(Math.abs(crate.vx)).toBeLessThan(40);
  });

  test("a frictionless body slides on a grippy floor", () => {
    // Combining with a maximum would let the floor's grip override the body's
    // own setting, which makes `friction: 0` a property that does nothing.
    const world = physics.world({ gravityY: 900 });
    world.addBox({ x: 0, y: 40, width: 800, height: 12, isStatic: true, friction: 0.9 });
    const puck = world.addBox({ x: -200, y: 0, width: 20, height: 12, vx: 200, friction: 0 });
    step(world, 120);
    expect(puck.vx).toBeCloseTo(200, 0);
  });

  test("torque spins a body without moving it", () => {
    const world = physics.world({ gravityY: 0 });
    const wheel = world.addCircle({ x: 0, y: 0, radius: 10 });
    // Held down like a throttle: one nudge leaves it turning slowly enough to
    // count as still, and it would be asleep again by the end.
    for (let i = 0; i < 30; i++) {
      world.applyTorque(wheel, 200_000);
      world.step(1 / 60);
    }
    expect(wheel.omega).toBeGreaterThan(1);
    // A force at the rim would have shoved it sideways as well.
    expect(wheel.x).toBe(0);
    expect(wheel.y).toBe(0);
  });

  test("remove drops a body from later steps", () => {
    const world = physics.world({ gravityY: 0 });
    const ball = world.addCircle({ x: 0, y: 0, radius: 4, vx: 10 });
    expect(world.remove(ball)).toBe(true);
    world.step(1);
    expect(ball.x).toBe(0);
    expect(world.remove(ball)).toBe(false);
  });

  test("forces and impulses reject a body from another world", () => {
    const home = physics.world({ gravityY: 0 });
    const other = physics.world({ gravityY: 0 });
    const ball = home.addCircle({ x: 0, y: 0, radius: 4 });
    expect(() => other.applyImpulse(ball, 1, 0)).toThrow(TypeError);
    expect(() => other.applyForce(ball, 1, 0)).toThrow(TypeError);
  });

  test("the same steps are deterministic", () => {
    const run = (): number => {
      const world = physics.world({ gravityY: 600, iterations: 8 });
      world.addBox({ x: 0, y: 80, width: 200, height: 10, isStatic: true });
      const a = world.addCircle({ x: -6, y: 0, radius: 8 });
      const b = world.addBox({ x: 10, y: -20, width: 16, height: 16, angle: 0.3 });
      step(world, 90);
      return a.x + a.y + b.x + b.y + b.angle;
    };
    expect(run()).toBe(run());
  });
});

describe("stacking", () => {
  test("a six-box stack stays standing", () => {
    // The single test that catches solving velocities the body has already
    // spent: with the constraint applied a step late, this stack scatters —
    // 65 units of drift and a crate turned upside down.
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true, friction: 0.6 });
    const stack = [];
    for (let i = 0; i < 6; i++) {
      stack.push(world.addBox({ x: 0, y: 278 - i * 26, width: 40, height: 24, friction: 0.6 }));
    }
    step(world, 600);

    for (const [i, box] of stack.entries()) {
      expect(Math.abs(box.x)).toBeLessThan(3);
      expect(Math.abs(box.angle)).toBeLessThan(0.05);
      // Still in the order they were stacked in, and none sunk into another.
      if (i > 0) expect(box.y).toBeLessThan((stack[i - 1] as physics.RigidBody).y - 20);
    }
  });

  test("a resting body barely penetrates what it rests on", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true });
    const crate = world.addBox({ x: 0, y: 100, width: 32, height: 24 });
    step(world, 240);
    const overlap = crate.y + 12 - 290;
    expect(overlap).toBeGreaterThanOrEqual(0);
    expect(overlap).toBeLessThan(0.5);
  });
});

describe("fast bodies", () => {
  test("a bullet does not cross a thin wall", () => {
    // 6000 units/s is 100 units a step against a 10-unit wall, so nothing but
    // a contact found before the shapes touch can stop it.
    for (const speed of [600, 2000, 6000]) {
      const world = physics.world({ gravityY: 0 });
      world.addBox({ x: 200, y: 0, width: 10, height: 400, isStatic: true });
      const bullet = world.addCircle({ x: 0, y: 0, radius: 4, vx: speed });
      step(world, 120);
      expect(bullet.x).toBeLessThan(195);
    }
  });

  test("a fast body stops at the surface rather than behind it", () => {
    const world = physics.world({ gravityY: 0 });
    world.addBox({ x: 200, y: 0, width: 10, height: 400, isStatic: true, restitution: 0 });
    const bullet = world.addCircle({ x: 0, y: 0, radius: 4, vx: 3000, restitution: 0 });
    step(world, 60);
    // The near face is at x=195, so a body held at the surface sits at 191 —
    // and one that was never stopped is several hundred units past it.
    expect(bullet.x).toBeGreaterThan(189);
    expect(bullet.x).toBeLessThan(193);
  });
});

describe("restitution", () => {
  test("a bounce reaches the height the coefficient predicts", () => {
    // Capturing the impact speed after gravity was added inflates every bounce
    // by e * gravity * dt, which reads as a ball that will not settle.
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 400, width: 400, height: 20, isStatic: true, restitution: 0.8 });
    const ball = world.addCircle({ x: 0, y: 100, radius: 10, restitution: 0.8, friction: 0 });
    // Resting centre is 380 (floor top 390, radius 10); it starts at 100.
    const dropped = 380 - 100;

    let bounced = false;
    let apex = Infinity;
    for (let i = 0; i < 400; i++) {
      world.step(1 / 60);
      if (ball.vy < 0) bounced = true;
      if (bounced && ball.vy < 0) apex = Math.min(apex, ball.y);
    }
    // A perfectly resolved bounce returns e^2 of the drop. Measured: 0.644
    // here against 0.622 when the impact speed is read after gravity.
    const rise = 380 - apex;
    expect(Math.abs(rise / dropped - 0.8 * 0.8)).toBeLessThan(0.015);
  });
});

describe("damping", () => {
  test("linear damping bleeds speed off a free body", () => {
    const world = physics.world({ gravityY: 0 });
    const drifting = world.addCircle({ x: 0, y: 0, radius: 4, vx: 100, linearDamping: 2 });
    const free = world.addCircle({ x: 0, y: 200, radius: 4, vx: 100 });
    step(world, 60);
    expect(free.vx).toBeCloseTo(100);
    // Damping is a rate, so one second at 2 leaves e^-2 of the speed.
    expect(drifting.vx / 100).toBeCloseTo(Math.exp(-2), 1);
  });

  test("angular damping stops a spin, and the world hands out its own default", () => {
    const world = physics.world({ gravityY: 0, angularDamping: 3 });
    const spinner = world.addBox({ x: 0, y: 0, width: 10, height: 10, omega: 8 });
    const stubborn = world.addBox({
      x: 100,
      y: 0,
      width: 10,
      height: 10,
      omega: 8,
      angularDamping: 0,
    });
    step(world, 120);
    expect(Math.abs(spinner.omega)).toBeLessThan(0.6);
    expect(stubborn.omega).toBeCloseTo(8);
  });

  test("damping cannot be negative", () => {
    const world = physics.world();
    expect(() => world.addCircle({ x: 0, y: 0, radius: 4, linearDamping: -1 })).toThrow(RangeError);
  });
});

describe("sleeping", () => {
  test("a settled body stops being simulated", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true, friction: 0.6 });
    const crate = world.addBox({ x: 0, y: 100, width: 32, height: 24, friction: 0.6 });
    expect(crate.isAwake).toBe(true);
    step(world, 240);
    expect(crate.isAwake).toBe(false);

    const restingY = crate.y;
    step(world, 240);
    expect(crate.y).toBe(restingY);
    expect(crate.vy).toBe(0);
  });

  test("a stack sleeps as one island, not a body at a time", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true, friction: 0.6 });
    const lower = world.addBox({ x: 0, y: 278, width: 40, height: 24, friction: 0.6 });
    const upper = world.addBox({ x: 0, y: 252, width: 40, height: 24, friction: 0.6 });
    // The bottom crate is still long before the top one settles. Sleeping it
    // alone would leave the pile resting on something nothing moves.
    for (let i = 0; i < 600; i++) {
      world.step(1 / 60);
      expect(lower.isAwake).toBe(upper.isAwake);
    }
    expect(lower.isAwake).toBe(false);
  });

  test("an impulse wakes a sleeper, and a contact impulse does not keep it up", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true, friction: 0.6 });
    const crate = world.addBox({ x: 0, y: 100, width: 32, height: 24, friction: 0.6 });
    step(world, 300);
    expect(crate.isAwake).toBe(false);

    world.applyImpulse(crate, 4000, 0);
    expect(crate.isAwake).toBe(true);
    expect(crate.vx).toBeGreaterThan(0);
    step(world, 600);
    expect(crate.isAwake).toBe(false);
  });

  test("something arriving wakes what it lands on", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true, friction: 0.6 });
    const crate = world.addBox({ x: 0, y: 100, width: 40, height: 24, friction: 0.6 });
    step(world, 300);
    expect(crate.isAwake).toBe(false);

    world.addCircle({ x: 0, y: 120, radius: 10, vy: 400 });
    step(world, 30);
    expect(crate.isAwake).toBe(true);
  });

  test("removing what a sleeper rests on lets it fall", () => {
    const world = physics.world({ gravityY: 1600 });
    const shelf = world.addBox({ x: 0, y: 300, width: 200, height: 20, isStatic: true });
    world.addBox({ x: 0, y: 500, width: 400, height: 20, isStatic: true });
    const crate = world.addBox({ x: 0, y: 100, width: 32, height: 24 });
    step(world, 300);
    expect(crate.isAwake).toBe(false);
    const shelfLevel = crate.y;

    world.remove(shelf);
    expect(crate.isAwake).toBe(true);
    step(world, 120);
    expect(crate.y).toBeGreaterThan(shelfLevel + 100);
  });

  test("wake() puts a body back into the simulation by hand", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true });
    const crate = world.addBox({ x: 0, y: 100, width: 32, height: 24 });
    step(world, 300);
    expect(crate.isAwake).toBe(false);
    world.wake(crate);
    expect(crate.isAwake).toBe(true);
  });
});

describe("broad phase", () => {
  test("a pair beyond the crowd is still found", () => {
    // The sweep stops walking forward as soon as a body starts past where the
    // current one ends. Stopping one body too early loses exactly this pair.
    const world = physics.world({ gravityY: 0 });
    for (let i = 0; i < 200; i++) {
      world.addCircle({ x: (i % 20) * 40, y: Math.floor(i / 20) * 40, radius: 6 });
    }
    const left = world.addCircle({ x: 5000, y: 0, radius: 10 });
    const right = world.addCircle({ x: 5006, y: 0, radius: 10 });
    step(world, 30);
    expect(right.x - left.x).toBeGreaterThan(19);
  });

  test("a heap settles inside a budget", () => {
    // Pairs are visited in sweep order, which changes as bodies slide past one
    // another. Presenting the same pair with its bodies swapped matches no
    // warm-start entry, so the solver rediscovers every accumulated impulse
    // from nothing: this heap goes quiet at frame 175 with a stable pair
    // identity and frame 417 without, and 160 boxes never settle at all.
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 600, width: 1000, height: 20, isStatic: true, friction: 0.6 });
    for (let i = 0; i < 80; i++) {
      world.addBox({
        x: -200 + (i % 16) * 26,
        y: 540 - Math.floor(i / 16) * 28,
        width: 24,
        height: 24,
        friction: 0.6,
      });
    }
    step(world, 300);
    const awake = world.bodies.filter((body) => !body.isStatic && body.isAwake).length;
    expect(awake).toBe(0);
  });
});

describe("queries", () => {
  test("a ray reports the nearest body, where it met it, and which way it faces", () => {
    const world = physics.world({ gravityY: 0 });
    const near = world.addCircle({ x: 100, y: 0, radius: 10 });
    world.addCircle({ x: 300, y: 0, radius: 10 });
    const hit = createRayHit();

    expect(world.raycast(0, 0, 1, 0, { out: hit })).toBe(near);
    expect(hit.distance).toBeCloseTo(90);
    expect(hit.x).toBeCloseTo(90);
    expect(hit.normalX).toBeCloseTo(-1);
    expect(hit.normalY).toBeCloseTo(0);
  });

  test("direction need not be normalised, and the distance is in world units", () => {
    const world = physics.world({ gravityY: 0 });
    world.addCircle({ x: 0, y: 100, radius: 10 });
    const hit = createRayHit();
    expect(world.raycast(0, 0, 0, 57, { out: hit })).not.toBeNull();
    expect(hit.distance).toBeCloseTo(90);
  });

  test("maxDistance stops the ray short", () => {
    const world = physics.world({ gravityY: 0 });
    world.addCircle({ x: 100, y: 0, radius: 10 });
    expect(world.raycast(0, 0, 1, 0, { maxDistance: 80 })).toBeNull();
    expect(world.raycast(0, 0, 1, 0, { maxDistance: 95 })).not.toBeNull();
  });

  test("ignore skips whatever fired the shot", () => {
    const world = physics.world({ gravityY: 0 });
    const shooter = world.addCircle({ x: 0, y: 0, radius: 12 });
    const target = world.addCircle({ x: 100, y: 0, radius: 10 });
    // Without this the muzzle is inside the shooter and every shot hits it.
    expect(world.raycast(0, 0, 1, 0)).toBe(shooter);
    expect(world.raycast(0, 0, 1, 0, { ignore: shooter })).toBe(target);
  });

  test("a ray meets an oriented box on the face it actually presents", () => {
    const world = physics.world({ gravityY: 0 });
    // Turned an eighth of a turn, so a horizontal ray meets a slanted face.
    const box = world.addBox({ x: 100, y: 0, width: 40, height: 40, angle: Math.PI / 4 });
    const hit = createRayHit();
    expect(world.raycast(0, 0, 1, 0, { out: hit })).toBe(box);
    // The corner now reaches half the diagonal towards the ray.
    expect(hit.distance).toBeCloseTo(100 - Math.SQRT2 * 20, 3);
    expect(Math.hypot(hit.normalX, hit.normalY)).toBeCloseTo(1);
    expect(hit.normalX).toBeLessThan(0);
  });

  test("a ray that meets nothing says so, and one pointing away too", () => {
    const world = physics.world({ gravityY: 0 });
    world.addCircle({ x: 100, y: 0, radius: 10 });
    expect(world.raycast(0, 200, 1, 0)).toBeNull();
    expect(world.raycast(0, 0, -1, 0)).toBeNull();
    expect(world.raycast(0, 0, 0, 0)).toBeNull();
  });

  test("a sleeping body is still there to be hit", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 300, width: 400, height: 20, isStatic: true });
    const crate = world.addBox({ x: 0, y: 100, width: 40, height: 40 });
    step(world, 300);
    expect(crate.isAwake).toBe(false);
    expect(world.raycast(-300, crate.y, 1, 0)).toBe(crate);
  });

  test("pointQuery picks the body under a point, latest first", () => {
    const world = physics.world({ gravityY: 0 });
    const under = world.addBox({ x: 0, y: 0, width: 60, height: 60 });
    expect(world.pointQuery(0, 0)).toBe(under);
    const over = world.addCircle({ x: 0, y: 0, radius: 10 });
    // Added later, so it is what a click lands on.
    expect(world.pointQuery(0, 0)).toBe(over);
    expect(world.pointQuery(28, 0)).toBe(under);
    expect(world.pointQuery(400, 0)).toBeNull();
  });

  test("pointQuery respects a box's rotation", () => {
    const world = physics.world({ gravityY: 0 });
    world.addBox({ x: 0, y: 0, width: 100, height: 10, angle: Math.PI / 2 });
    // Turned upright: the point is inside along the new long axis and outside
    // along the short one.
    expect(world.pointQuery(0, 40)).not.toBeNull();
    expect(world.pointQuery(40, 0)).toBeNull();
  });
});

describe("joints", () => {
  test("a rod carries an impulse to the far end without inventing momentum", () => {
    const world = physics.world({ gravityY: 0 });
    const a = world.addCircle({ x: 0, y: 0, radius: 8 });
    const b = world.addCircle({ x: 60, y: 0, radius: 8 });
    world.addDistanceJoint({ a, b });
    world.applyImpulse(a, -4000, 0);
    step(world, 120);

    // One rigid body of both masses would move at exactly this speed.
    const shared = -4000 / (a.mass + b.mass);
    expect(a.vx).toBeCloseTo(shared, 3);
    expect(b.vx).toBeCloseTo(shared, 3);
    expect(b.x - a.x).toBeCloseTo(60, 3);
  });

  test("length defaults to however far apart the anchors start", () => {
    const world = physics.world({ gravityY: 0 });
    const a = world.addCircle({ x: 0, y: 0, radius: 4 });
    const b = world.addCircle({ x: 0, y: 45, radius: 4 });
    expect(world.addDistanceJoint({ a, b }).length).toBeCloseTo(45);
    expect(world.addDistanceJoint({ a, b, length: 10 }).length).toBe(10);
  });

  test("a rope hangs at its rest length and settles", () => {
    const world = physics.world({ gravityY: 1600 });
    let previous: physics.RigidBody | null = null;
    const links: physics.RigidBody[] = [];
    for (let i = 0; i < 5; i++) {
      const link = world.addCircle({ x: 0, y: 30 + i * 30, radius: 6, linearDamping: 0.4 });
      links.push(link);
      if (previous === null)
        world.addDistanceJoint({ a: link, anchorBX: 0, anchorBY: 0, length: 30 });
      else world.addDistanceJoint({ a: previous, b: link, length: 30 });
      previous = link;
    }
    step(world, 900);

    for (const [i, link] of links.entries()) {
      const ax = i === 0 ? 0 : (links[i - 1] as physics.RigidBody).x;
      const ay = i === 0 ? 0 : (links[i - 1] as physics.RigidBody).y;
      expect(Math.hypot(link.x - ax, link.y - ay)).toBeCloseTo(30, 1);
    }
    // Hanging straight down from the anchor at the origin.
    expect((links[4] as physics.RigidBody).y).toBeCloseTo(150, 0);
  });

  test("a pin holds its anchor while leaving rotation free", () => {
    const world = physics.world({ gravityY: 1600 });
    const arm = world.addBox({ x: 100, y: 0, width: 160, height: 12 });
    world.addPinJoint({ a: arm, anchorAX: -80, anchorAY: 0, anchorBX: 20, anchorBY: 0 });

    let worst = 0;
    for (let i = 0; i < 600; i++) {
      world.step(1 / 60);
      const c = Math.cos(arm.angle);
      const s = Math.sin(arm.angle);
      worst = Math.max(worst, Math.hypot(arm.x + c * -80 - 20, arm.y + s * -80));
    }
    expect(worst).toBeLessThan(3);
    // It swung rather than hanging rigid from the start.
    expect(Math.abs(arm.angle)).toBeGreaterThan(0.2);
  });

  test("cutting the joint drops what it held", () => {
    const world = physics.world({ gravityY: 1600 });
    const weight = world.addCircle({ x: 0, y: 60, radius: 8 });
    const rope = world.addDistanceJoint({ a: weight, anchorBX: 0, anchorBY: 0, length: 60 });
    step(world, 300);
    const held = weight.y;
    expect(held).toBeCloseTo(60, 0);

    expect(world.removeJoint(rope)).toBe(true);
    expect(world.removeJoint(rope)).toBe(false);
    step(world, 60);
    expect(weight.y).toBeGreaterThan(held + 50);
  });

  test("removing a body takes its joints with it", () => {
    const world = physics.world({ gravityY: 0 });
    const a = world.addCircle({ x: 0, y: 0, radius: 6 });
    const b = world.addCircle({ x: 40, y: 0, radius: 6 });
    world.addDistanceJoint({ a, b });
    expect(world.joints).toHaveLength(1);
    world.remove(b);
    // Solving against a body the world no longer owns is a ghost constraint.
    expect(world.joints).toHaveLength(0);
    expect(() => world.step(1 / 60)).not.toThrow();
  });

  test("a joint sleeps and wakes as one island", () => {
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 0, y: 400, width: 400, height: 20, isStatic: true, friction: 0.6 });
    const anchor = world.addCircle({ x: 0, y: 100, radius: 8, isStatic: true });
    const weight = world.addCircle({ x: 0, y: 160, radius: 8, linearDamping: 0.6 });
    world.addDistanceJoint({ a: anchor, b: weight, length: 60 });
    step(world, 600);
    expect(weight.isAwake).toBe(false);

    const passer = world.addCircle({ x: 0, y: 260, radius: 8 });
    world.applyImpulse(passer, 0, -20000);
    step(world, 20);
    expect(weight.isAwake).toBe(true);
  });

  test("a struck rope does not gain energy", () => {
    // A distance joint pulls along its own axis, so its accumulated impulse
    // has to be a scalar rebuilt along the current axis. Warm starting from a
    // stored vector re-applies it along an axis the rope has swung away from,
    // and nothing takes that back: hit side-on, this rope reached 10^8 units
    // per second within a second and then went non-finite. Everything here
    // stays inside what a fall down a 600-unit room can produce.
    const world = physics.world({ gravityY: 1600 });
    world.addBox({ x: 300, y: 588, width: 600, height: 24, isStatic: true, friction: 0.7 });
    world.addBox({ x: 300, y: 12, width: 600, height: 24, isStatic: true });
    world.addBox({ x: 8, y: 300, width: 16, height: 600, isStatic: true });
    world.addBox({ x: 592, y: 300, width: 16, height: 600, isStatic: true });

    let above: physics.RigidBody | null = null;
    for (let i = 0; i < 7; i++) {
      const heavy = i === 6;
      const link = world.addCircle({
        x: 300,
        y: 40 + i * 26,
        radius: heavy ? 14 : 6,
        density: heavy ? 3 : 1,
      });
      if (above === null) {
        world.addDistanceJoint({ a: link, anchorBX: 300, anchorBY: 20, length: 26 });
      } else {
        world.addDistanceJoint({ a: above, b: link, length: 26 });
      }
      above = link;
    }
    for (let i = 0; i < 3; i++) {
      world.addCircle({ x: 260 + i * 6, y: 40 + i * 10, radius: 16 - i, restitution: 0.72 });
    }

    let peak = 0;
    for (let i = 0; i < 900; i++) {
      world.step(1 / 60);
      for (const body of world.bodies) {
        peak = Math.max(peak, Math.abs(body.vx) + Math.abs(body.vy));
      }
    }
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(2500);
  });

  test("a struck chain goes back to its length", () => {
    // The velocity solve only removes relative motion along the joint; the
    // length itself is restored by the position pass. Running that pass once
    // takes out a fifth of the error, which a swinging chain puts straight
    // back: hit side-on, this rope sat 1.5% long ten seconds later instead of
    // settling to its rest length.
    const world = physics.world({ gravityY: 1600, linearDamping: 0.2 });
    const links: physics.RigidBody[] = [];
    let above: physics.RigidBody | null = null;
    for (let i = 0; i < 7; i++) {
      const heavy = i === 6;
      const link = world.addCircle({
        x: 300,
        y: 40 + i * 26,
        radius: heavy ? 14 : 6,
        density: heavy ? 3 : 1,
        linearDamping: 0.3,
      });
      links.push(link);
      if (above === null) {
        world.addDistanceJoint({ a: link, anchorBX: 300, anchorBY: 20, length: 26 });
      } else {
        world.addDistanceJoint({ a: above, b: link, length: 26 });
      }
      above = link;
    }
    step(world, 600);
    world.applyImpulse(links[6] as physics.RigidBody, 40000, 0);
    step(world, 600);

    for (const [i, link] of links.entries()) {
      const ax = i === 0 ? 300 : (links[i - 1] as physics.RigidBody).x;
      const ay = i === 0 ? 20 : (links[i - 1] as physics.RigidBody).y;
      // 0.08 off with four position passes, 0.39 off with one.
      expect(Math.abs(Math.hypot(link.x - ax, link.y - ay) - 26)).toBeLessThan(0.15);
    }
  });

  test("moving a world anchor drags the body with it", () => {
    // This is what a pointer drag is: a joint pinned to the world whose anchor
    // is moved to the cursor every frame.
    const world = physics.world({ gravityY: 0 });
    const body = world.addCircle({ x: 0, y: 0, radius: 8, linearDamping: 4 });
    const leash = world.addDistanceJoint({ a: body, anchorBX: 0, anchorBY: 0, length: 0 });

    for (let frame = 0; frame < 240; frame++) {
      leash.anchorBX = Math.min(frame * 2, 300);
      world.wake(body);
      world.step(1 / 60);
    }
    expect(body.x).toBeCloseTo(300, 0);
    expect(body.y).toBeCloseTo(0, 0);
  });

  test("a stiffness turns a rod into a spring at the frequency asked for", () => {
    const world = physics.world({ gravityY: 1000 });
    const weight = world.addCircle({ x: 0, y: 100, radius: 10 });
    world.addDistanceJoint({
      a: weight,
      anchorBX: 0,
      anchorBY: 0,
      length: 100,
      stiffness: 1,
      damping: 0.1,
    });

    // Time between the two lowest points is the period.
    let previous = weight.y;
    let rising = false;
    const dips: number[] = [];
    for (let frame = 0; frame < 900; frame++) {
      world.step(1 / 60);
      const goingUp = weight.y < previous;
      if (goingUp && !rising) dips.push(frame);
      rising = goingUp;
      previous = weight.y;
    }
    expect(dips.length).toBeGreaterThan(1);
    const period = ((dips[1] as number) - (dips[0] as number)) / 60;
    expect(period).toBeCloseTo(1, 1);
    // It hangs below the rest length, the way a loaded spring does.
    expect(weight.y).toBeGreaterThan(110);
  });

  test("damping of 1 settles without overshooting, and no stiffness stays rigid", () => {
    const world = physics.world({ gravityY: 1000 });
    const damped = world.addCircle({ x: 0, y: 100, radius: 10 });
    world.addDistanceJoint({
      a: damped,
      anchorBX: 0,
      anchorBY: 0,
      length: 100,
      stiffness: 3,
      damping: 1,
    });
    const rigid = world.addCircle({ x: 200, y: 100, radius: 10 });
    world.addDistanceJoint({ a: rigid, anchorBX: 200, anchorBY: 0, length: 100 });

    let lowest = 0;
    let rigidLowest = 0;
    for (let frame = 0; frame < 600; frame++) {
      world.step(1 / 60);
      lowest = Math.max(lowest, damped.y);
      rigidLowest = Math.max(rigidLowest, rigid.y);
    }
    // Critically damped: where it ends is the furthest it ever went.
    expect(lowest).toBeCloseTo(damped.y, 1);
    expect(damped.y).toBeGreaterThan(101);
    // A rod does not stretch under the same load at all.
    expect(rigidLowest).toBeCloseTo(100, 1);
  });

  test("a joint needs two different bodies", () => {
    const world = physics.world();
    const only = world.addCircle({ x: 0, y: 0, radius: 4 });
    expect(() => world.addDistanceJoint({ a: only, b: only })).toThrow(TypeError);
    const stranger = physics.world().addCircle({ x: 0, y: 0, radius: 4 });
    expect(() => world.addPinJoint({ a: only, b: stranger })).toThrow(TypeError);
  });
});
