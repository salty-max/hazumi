import { describe, expect, test } from "bun:test";
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
