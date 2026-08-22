import { describe, expect, test } from "bun:test";
import { createPluginHost } from "@hazumi/core";

import { physics, PhysicsPluginInUseError, Shape } from "../src/index";

describe("physics plugin", () => {
  test("puts a world on the host and steps it after each fixed update", () => {
    const host = createPluginHost()
      .use(physics({ gravityY: 1600 }))
      .build();
    const ball = host.physics.world.addCircle({ x: 0, y: 0, radius: 8 });

    host.preupdate(1 / 60);
    expect(ball.vy).toBe(0);

    host.postupdate(1 / 60);
    expect(ball.vy).toBeCloseTo(1600 / 60);
    expect(ball.y).toBeGreaterThan(0);
    expect(Shape.Circle).toBe(0);
  });

  test("paused and autoStep skip integration", () => {
    const host = createPluginHost()
      .use(physics({ gravityY: 1600 }))
      .build();
    const ball = host.physics.world.addCircle({ x: 0, y: 0, radius: 8 });

    host.physics.paused = true;
    host.postupdate(1 / 60);
    expect(ball.y).toBe(0);

    host.physics.paused = false;
    host.physics.autoStep = false;
    host.postupdate(1 / 60);
    expect(ball.y).toBe(0);
  });

  test("dispose clears bodies so a later step is empty", () => {
    const host = createPluginHost().use(physics()).build();
    host.physics.world.addBox({ x: 0, y: 0, width: 10, height: 10 });
    expect(host.physics.world.bodies).toHaveLength(1);
    host.dispose();
    expect(host.physics.world.bodies).toHaveLength(0);
  });

  test("rejects installing the same plugin instance twice", () => {
    const plugin = physics();
    createPluginHost().use(plugin).build();
    expect(() => createPluginHost().use(plugin).build()).toThrow(PhysicsPluginInUseError);
  });

  test("can be reused after dispose", () => {
    const plugin = physics({ gravityY: 800 });
    const first = createPluginHost().use(plugin).build();
    first.dispose();
    const second = createPluginHost().use(plugin).build();
    expect(second.physics.world.gravityY).toBe(800);
    second.dispose();
  });
});
