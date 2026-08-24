import { describe, expect, test } from "bun:test";
import { CommandBuffer } from "@hazumi/graphics";
import { record } from "@hazumi/backend-headless";
import { enterContext, restoreContext } from "../src/active-context";
import { ColorCache } from "../src/color-cache";
import { createContext, type ContextState, type HazumiContext } from "../src/context";
import { InvalidBorderError, ninePatch } from "../src/nine-patch";
import { spritesheet } from "../src/spritesheet";

const image = (width: number, height: number): never => ({ width, height }) as never;

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
    measureText: (content: string, _font: string, size: number) => ({
      width: [...content].length * size * 0.5,
      ascent: size * 0.8,
      descent: size * 0.2,
      lineHeight: size * 1.2,
    }),
  });
  return { ctx: context, buffer };
}

/** Dest rectangles of the emitted image commands, in draw order. */
function drawn(body: () => void): { x: number; y: number; w: number; h: number }[] {
  const h = makeContext();
  const previous = enterContext(h.ctx);
  try {
    body();
  } finally {
    restoreContext(previous);
  }
  return record(h.buffer)
    .filter((command) => command.op === "imageRegion")
    .map((command) => {
      const args = command.args as readonly number[];
      return {
        x: args[0] as number,
        y: args[1] as number,
        w: args[2] as number,
        h: args[3] as number,
      };
    });
}

const tile = spritesheet(image(16, 16), { frames: { panel: [0, 0, 16, 16] } }).named("panel");

describe("ninePatch", () => {
  test("cuts nine pieces and draws them all", () => {
    const box = ninePatch(tile, 5);
    const rects = drawn(() => {
      box.draw(0, 0, 100, 60);
    });
    expect(rects).toHaveLength(9);
  });

  test("corners keep their size and only the spans grow", () => {
    const box = ninePatch(tile, 5, { scale: 3 });
    const rects = drawn(() => {
      box.draw(10, 20, 100, 60);
    });
    // Corner at 5px source, scale 3, so 15 on screen wherever it lands.
    expect(rects[0]).toEqual({ x: 10, y: 20, w: 15, h: 15 });
    expect(rects[2]).toEqual({ x: 95, y: 20, w: 15, h: 15 });
    expect(rects[6]).toEqual({ x: 10, y: 65, w: 15, h: 15 });
    expect(rects[8]).toEqual({ x: 95, y: 65, w: 15, h: 15 });
    // The middle takes what is left over, in both axes.
    expect(rects[4]).toEqual({ x: 25, y: 35, w: 70, h: 30 });
  });

  test("the box lands exactly where it was asked to", () => {
    const box = ninePatch(tile, 4, { scale: 2 });
    const rects = drawn(() => {
      box.draw(7, 9, 120, 80);
    });
    const right = Math.max(...rects.map((r) => r.x + r.w));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    expect(Math.min(...rects.map((r) => r.x))).toBe(7);
    expect(Math.min(...rects.map((r) => r.y))).toBe(9);
    expect(right).toBe(127);
    expect(bottom).toBe(89);
  });

  test("a box smaller than its own border shrinks rather than folding over", () => {
    const box = ninePatch(tile, 5, { scale: 4 });
    // Border alone would want 40 across; the box is 20.
    const rects = drawn(() => {
      box.draw(0, 0, 20, 20);
    });
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(20);
    }
    expect(box.minWidth).toBe(40);
  });

  test("a borderless side emits no degenerate quads", () => {
    // Top and bottom only: the left and right columns have no width to draw.
    const box = ninePatch(tile, [5, 0]);
    const rects = drawn(() => {
      box.draw(0, 0, 40, 40);
    });
    expect(rects).toHaveLength(3);
  });

  test("CSS-style shorthands set the sides", () => {
    expect(ninePatch(tile, 3).border).toEqual([3, 3, 3, 3]);
    expect(ninePatch(tile, [2, 6]).border).toEqual([2, 6, 2, 6]);
    expect(ninePatch(tile, [1, 2, 3, 4]).border).toEqual([1, 2, 3, 4]);
  });

  test("a border too big for its frame is refused", () => {
    expect(() => ninePatch(tile, 9)).toThrow(InvalidBorderError);
    expect(() => ninePatch(tile, 2.5)).toThrow(/whole pixels/);
    expect(() => ninePatch(tile, 4, { scale: 0 })).toThrow(/greater than zero/);
  });
});
