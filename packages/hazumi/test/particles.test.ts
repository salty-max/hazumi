import { describe, expect, test } from "bun:test";
import { seeded } from "@hazumi/math";
import { record } from "@hazumi/backend-headless";
import { Blend, CommandBuffer } from "@hazumi/graphics";
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
    // A monospace stand-in: every glyph half the font size wide, so a test can
    // assert on layout arithmetic without a real font.
    measureText: (content: string, _font: string, size: number) => ({
      width: [...content].length * size * 0.5,
      ascent: size * 0.8,
      descent: size * 0.2,
      lineHeight: size * 1.2,
    }),
  });
  return { ctx: context, buffer };
}

function withScene(body: () => void): void {
  const h = makeContext();
  const previous = enterContext(h.ctx);
  try {
    body();
  } finally {
    restoreContext(previous);
  }
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
    withScene(() => {
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
      expect(ops.filter((op) => op === "setFill")).toHaveLength(1);
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

  test("gravity and drag change velocity", () => {
    const dust = particles({ capacity: 1, gravity: { y: 100 }, drag: 0, random: seeded(1) });
    dust.emit({ x: 0, y: 0, count: 1, speed: 0, life: 2 });
    dust.update(0.5);
    withScene(() => {
      let vy = 0;
      dust.draw((p) => {
        vy = p.vy;
      });
      expect(vy).toBeCloseTo(50);
    });
  });

  test("colour and size lerp toward the end values", () => {
    const dust = particles({ capacity: 1, random: seeded(1) });
    dust.emit({
      x: 0,
      y: 0,
      count: 1,
      speed: 0,
      life: 1,
      size: 10,
      endSize: 0,
      color: "#ffffff",
      endColor: "#000000",
    });
    dust.update(0.5);
    withScene(() => {
      dust.draw((p) => {
        expect(p.t).toBeCloseTo(0.5);
        expect(p.size).toBeCloseTo(5);
        expect(p.r).toBeCloseTo(0.5, 1);
      });
    });
  });

  test("a range origin sprays across a segment", () => {
    const dust = particles({ capacity: 16, random: seeded(3) });
    dust.emit({ x: [0, 100], y: 0, count: 16, speed: 0, life: 1 });
    withScene(() => {
      const xs: number[] = [];
      dust.draw((p) => xs.push(p.x));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThan(100);
      expect(new Set(xs.map((x) => x.toFixed(3))).size).toBeGreaterThan(1);
    });
  });

  test("vx/vy are added on top of the polar speed", () => {
    const dust = particles({ capacity: 1, random: seeded(1) });
    dust.emit({ x: 0, y: 0, count: 1, speed: 0, vx: 12, vy: -8, life: 1 });
    withScene(() => {
      dust.draw((p) => {
        expect(p.vx).toBe(12);
        expect(p.vy).toBe(-8);
      });
    });
  });

  test("draw interpolates position with alpha", () => {
    const dust = particles({ capacity: 1, random: seeded(1) });
    dust.emit({ x: 0, y: 0, count: 1, speed: 0, vx: 10, vy: 0, life: 2 });
    dust.update(1);
    withScene(() => {
      const at = (alpha: number): number => {
        let x = 0;
        dust.draw((p) => {
          x = p.x;
        }, alpha);
        return x;
      };
      expect(at(0)).toBeCloseTo(0);
      expect(at(1)).toBeCloseTo(10);
      expect(at(0.5)).toBeCloseTo(5);
    });
  });

  test("spin advances the sprite angle", () => {
    const dust = particles({ capacity: 1, random: seeded(1) });
    dust.emit({ x: 0, y: 0, count: 1, speed: 0, rotation: 0, spin: 2, life: 2 });
    dust.update(0.5);
    withScene(() => {
      dust.draw((p) => {
        expect(p.angle).toBeCloseTo(1);
      });
    });
  });

  test("drip accumulates fractional particles across updates", () => {
    const dust = particles({ capacity: 8, random: seeded(1) });
    dust.drip({ x: 0, y: 0, rate: 30, speed: 0, life: 10 }, 0.02);
    expect(dust.count).toBe(0);
    dust.drip({ x: 0, y: 0, rate: 30, speed: 0, life: 10 }, 0.02);
    expect(dust.count).toBe(1);
  });

  test("default draw uses additive blending and one setFill for a flat burst", () => {
    const h = makeContext();
    const previous = enterContext(h.ctx);
    try {
      const dust = particles({ capacity: 4, random: seeded(1) });
      dust.emit({ x: 0, y: 0, count: 4, speed: 0, size: 8, life: 1, color: "#ff0000" });
      h.buffer.reset();
      dust.draw();
      const ops = record(h.buffer);
      expect(ops.find((c) => c.op === "setBlend")?.args).toEqual([Blend.Add]);
      expect(ops.filter((c) => c.op === "setFill")).toHaveLength(1);
      expect(ops.filter((c) => c.op === "circle")).toHaveLength(4);
    } finally {
      restoreContext(previous);
    }
  });

  test("an image burst emits image commands with tint, not circles", () => {
    const h = makeContext();
    const previous = enterContext(h.ctx);
    try {
      const sprite = {
        source: { width: 16, height: 16 } as never,
        x: 0,
        y: 0,
        width: 16,
        height: 16,
      };
      const dust = particles({
        capacity: 2,
        random: seeded(1),
        image: sprite,
        blend: Blend.Normal,
      });
      dust.emit({ x: 10, y: 20, count: 2, speed: 0, rotation: 0, size: 16, life: 1 });
      h.buffer.reset();
      dust.draw();
      const ops = record(h.buffer).map((c) => c.op);
      expect(ops).toContain("imageRegion");
      expect(ops).not.toContain("circle");
      expect(ops).toContain("setTint");
    } finally {
      restoreContext(previous);
    }
  });
});
