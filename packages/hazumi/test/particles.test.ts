import { describe, expect, test } from "bun:test";
import { seeded } from "@hazumi/math";
import { record } from "@hazumi/backend-headless";
import { CommandBuffer } from "@hazumi/graphics";
import { enterContext, restoreContext } from "../src/active-context";
import { ColorCache } from "../src/color-cache";
import { createContext, type ContextState, type HazumiContext } from "../src/context";
import { particles } from "../src/particles";

function makeState(): ContextState {
  return {
    width: 400,
    height: 300,
    pixelRatio: 1,
    frameCount: 0,
    t: 0,
    dt: 0,
    mouseX: 0,
    mouseY: 0,
    pmouseX: 0,
    pmouseY: 0,
    mouseIsPressed: false,
    mouseButton: 0,
    keyIsPressed: false,
    key: "",
    keysDown: new Set<string>(),
    keysPressed: new Set<string>(),
    keysReleased: new Set<string>(),
    mouseButtonsPressed: new Set<number>(),
    mouseButtonsReleased: new Set<number>(),
    pointers: [],
    pointersPressed: new Set<number>(),
    pointersReleased: new Set<number>(),
    wheelX: 0,
    wheelY: 0,
    gamepads: [],
    gamepadButtonsPressed: new Map(),
    gamepadButtonsReleased: new Map(),
    looping: true,
  };
}

function makeContext(): { ctx: HazumiContext; buffer: CommandBuffer } {
  const buffer = new CommandBuffer();
  const { context } = createContext({
    buffer,
    colors: new ColorCache(),
    state: makeState(),
    seed: 1,
    setPasses: () => {},
  });
  return { ctx: context, buffer };
}

describe("particles", () => {
  test("rejects a non-positive capacity", () => {
    expect(() => particles({ capacity: 0, random: seeded(1) })).toThrow(/positive integer/);
    expect(() => particles({ capacity: 1.5, random: seeded(1) })).toThrow(/positive integer/);
  });

  test("drops emits that would exceed the pool", () => {
    const dust = particles({ capacity: 3, random: seeded(1) });
    dust.emit({ x: 0, y: 0, count: 8 });
    expect(dust.count).toBe(3);
  });

  test("update expires particles and frees slots", () => {
    const dust = particles({ capacity: 4, random: seeded(1) });
    dust.emit({ x: 0, y: 0, count: 2, life: 0.1, speed: 0 });
    dust.update(0.05);
    expect(dust.count).toBe(2);
    dust.update(0.1);
    expect(dust.count).toBe(0);
    dust.emit({ x: 1, y: 1, count: 2, life: 1, speed: 0 });
    expect(dust.count).toBe(2);
  });

  test("the same seed emits the same burst", () => {
    const a = particles({ capacity: 8, random: seeded(7) });
    const b = particles({ capacity: 8, random: seeded(7) });
    a.emit({ x: 10, y: 20, count: 5, speed: [10, 80], life: [0.2, 0.8] });
    b.emit({ x: 10, y: 20, count: 5, speed: [10, 80], life: [0.2, 0.8] });
    a.update(0.016);
    b.update(0.016);
    const seen: number[] = [];
    a.draw((p) => {
      seen.push(p.x, p.y, p.vx, p.vy);
    });
    let i = 0;
    b.draw((p) => {
      expect(p.x).toBe(seen[i] as number);
      expect(p.y).toBe(seen[i + 1] as number);
      i += 4;
    });
    expect(i).toBe(20);
  });

  test("default draw writes one circle per particle without allocating style per particle", () => {
    const h = makeContext();
    const previous = enterContext(h.ctx);
    try {
      const dust = particles({ capacity: 4, random: seeded(1) });
      dust.emit({ x: 40, y: 50, count: 3, speed: 0, size: 10, life: 1 });
      h.buffer.reset();
      dust.draw();
      const ops = record(h.buffer).map((c) => c.op);
      expect(ops[0]).toBe("push");
      expect(ops.at(-1)).toBe("pop");
      expect(ops.filter((op) => op === "circle")).toHaveLength(3);
      expect(ops.filter((op) => op === "setFill")).toHaveLength(3);
    } finally {
      restoreContext(previous);
    }
  });

  test("clear drops every live particle", () => {
    const dust = particles({ capacity: 4, random: seeded(1) });
    dust.emit({ x: 0, y: 0, count: 4, life: 10 });
    dust.clear();
    expect(dust.count).toBe(0);
  });
});
