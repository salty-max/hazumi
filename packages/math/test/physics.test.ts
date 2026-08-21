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
    expect(moving.omega).not.toBe(0);
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
