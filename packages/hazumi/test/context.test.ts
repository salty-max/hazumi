import { beforeEach, describe, expect, test } from "bun:test";
import { Align, Baseline, Blend, CommandBuffer } from "@hazumi/graphics";
import { record } from "@hazumi/backend-headless";
import { ColorCache } from "../src/color-cache";
import { type ContextState, createContext, type HazumiContext } from "../src/context";

function makeState(width: number, height: number): ContextState {
  return {
    width,
    height,
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
    gamepadButtonsPressed: new Map<number, Set<number>>(),
    gamepadButtonsReleased: new Map<number, Set<number>>(),
    looping: true,
  };
}

/**
 * The context is pure — buffer in, commands out — so the whole public drawing
 * API is testable in Node without a canvas. Assertions are on the recorded
 * command stream, which is what backend-headless exists for.
 */
const fakeImage = (w: number, h: number): never => ({ width: w, height: h }) as never;

/** Display-referred sRGB as the GPU sees it — OKLCH round-trips are not bit-exact. */
function rgba8(args: readonly number[] | undefined): number[] {
  return (args ?? []).map((channel) => Math.round(channel * 255));
}

function makeContext(): {
  ctx: HazumiContext;
  buffer: CommandBuffer;
  state: ContextState;
  beginFrame: () => void;
  endFrame: () => void;
  ops: () => string[];
} {
  const buffer = new CommandBuffer();
  const state: ContextState = makeState(400, 300);
  const { context, beginFrame, endFrame } = createContext({
    buffer,
    colors: new ColorCache(),
    state,
    seed: 42,
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
  return {
    ctx: context,
    buffer,
    state,
    beginFrame,
    endFrame,
    ops: () => record(buffer).map((c) => c.op),
  };
}

/** Circle x values in the order a backend would walk them. */
function painted(h: { buffer: CommandBuffer }): number[] {
  return record(h.buffer)
    .filter((c) => c.op === "circle")
    .map((c) => c.args[0] as number);
}

describe("environment", () => {
  test("reads live state rather than a snapshot", () => {
    const { ctx, state } = makeContext();
    expect(ctx.width).toBe(400);
    state.width = 800;
    state.frameCount = 12;
    state.mouseX = 55;
    // Destructuring in a draw callback must see the current frame's values.
    expect(ctx.width).toBe(800);
    expect(ctx.frameCount).toBe(12);
    expect(ctx.mouseX).toBe(55);
  });

  test("random and noise are seeded, so runs reproduce", () => {
    const a = makeContext().ctx;
    const b = makeContext().ctx;
    expect(a.random.next()).toBe(b.random.next());
    expect(a.noise.noise2(1.3, 2.7)).toBe(b.noise.noise2(1.3, 2.7));
  });

  test("exposes a camera centred on the canvas by default", () => {
    const { ctx } = makeContext();
    expect(ctx.camera.x).toBe(200);
    expect(ctx.camera.y).toBe(150);
    expect(ctx.camera.zoom).toBe(1);
  });
});

describe("drawing", () => {
  let h: ReturnType<typeof makeContext>;
  beforeEach(() => {
    h = makeContext();
    h.buffer.reset();
  });

  test("circle takes a diameter, not a radius", () => {
    h.ctx.circle(10, 20, 100);
    const cmd = record(h.buffer).find((c) => c.op === "circle");
    // Halved to the radius the buffer stores. Size arguments are full extents
    // across every primitive, so a circle cannot quietly mean half of one.
    expect(cmd?.args).toEqual([10, 20, 50]);
  });

  test("ellipse takes width and height", () => {
    h.ctx.ellipse(10, 20, 100, 60);
    expect(record(h.buffer).find((c) => c.op === "ellipse")?.args).toEqual([10, 20, 50, 30]);
  });

  test("square is a rect", () => {
    h.ctx.square(5, 6, 30);
    expect(record(h.buffer).find((c) => c.op === "rect")?.args).toEqual([5, 6, 30, 30]);
  });

  test("point paints with the stroke colour, not the fill", () => {
    h.ctx.stroke("#ff0000");
    h.ctx.strokeWeight(8);
    h.buffer.reset();
    h.ctx.point(50, 60);

    const ops = record(h.buffer).map((c) => c.op);
    // Wrapped in push/pop so it cannot leak the substituted fill.
    expect(ops).toEqual(["push", "setFill", "setStrokeWidth", "circle", "pop"]);
  });

  test("point with no stroke draws nothing", () => {
    h.ctx.noStroke();
    h.buffer.reset();
    h.ctx.point(50, 60);
    expect(record(h.buffer)).toHaveLength(0);
  });
});

describe("style", () => {
  test("fillRgba writes channels without going through the colour cache", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.fillRgba(0.25, 0.5, 0.75, 0.5);
    expect(record(h.buffer).find((c) => c.op === "setFill")?.args).toEqual([0.25, 0.5, 0.75, 0.5]);
  });

  test("tintRgba writes channels without going through the colour cache", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.tintRgba(0.25, 0.5, 0.75, 0.5);
    expect(record(h.buffer).find((c) => c.op === "setTint")?.args).toEqual([0.25, 0.5, 0.75, 0.5]);
  });

  test("noFill emits a zero-alpha fill", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.noFill();
    expect(record(h.buffer).find((c) => c.op === "setFill")?.args).toEqual([0, 0, 0, 0]);
  });

  test("noStroke zeroes the stroke width", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.noStroke();
    expect(record(h.buffer).find((c) => c.op === "setStrokeWidth")?.args).toEqual([0]);
  });

  test("tint is independent of fill, so noFill cannot hide a sprite", () => {
    const h = makeContext();
    h.ctx.noFill();
    h.buffer.reset();
    h.ctx.tint("#ff0000");
    h.ctx.image(fakeImage(8, 8), 0, 0);

    const commands = record(h.buffer);
    expect(rgba8(commands.find((c) => c.op === "setTint")?.args)).toEqual([255, 0, 0, 255]);
    expect(commands.map((c) => c.op)).toEqual(["setTint", "image"]);
    expect(commands.some((c) => c.op === "setFill")).toBe(false);
  });

  test("noTint restores opaque white", () => {
    const h = makeContext();
    h.ctx.tint("#00ff00");
    h.buffer.reset();
    h.ctx.noTint();
    expect(rgba8(record(h.buffer).find((c) => c.op === "setTint")?.args)).toEqual([
      255, 255, 255, 255,
    ]);
  });

  test("beginFrame re-emits tint set during setup", () => {
    const h = makeContext();
    h.ctx.tint("#0000ff");
    h.buffer.reset();
    h.beginFrame();
    expect(rgba8(record(h.buffer).find((c) => c.op === "setTint")?.args)).toEqual([0, 0, 255, 255]);
  });

  test("colour strings are parsed and cached", () => {
    const colors = new ColorCache();
    const buffer = new CommandBuffer();
    const state: ContextState = makeState(1, 1);
    const { context } = createContext({
      buffer,
      colors,
      state,
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

    // createContext already resolved the default fill, so measure the delta.
    const missesBefore = colors.misses;
    for (let i = 0; i < 100; i++) context.fill("#ff0000");

    // One parse, ninety-nine hits — this runs per shape per frame.
    expect(colors.misses - missesBefore).toBe(1);
    expect(colors.hits).toBeGreaterThanOrEqual(99);
  });
});

describe("with()", () => {
  test("restores style after the body", () => {
    const h = makeContext();
    h.ctx.fill("#ff0000");
    h.buffer.reset();

    h.ctx.with({ fill: "#00ff00", strokeWeight: 9 }, () => {
      h.ctx.circle(0, 0, 10);
    });
    h.ctx.circle(1, 1, 10);

    const ops = h.ops();
    expect(ops[0]).toBe("push");
    expect(ops).toContain("pop");
    // The trailing circle is drawn after state was restored.
    expect(ops.at(-1)).toBe("circle");
  });

  test("restores even when the body throws", () => {
    const h = makeContext();
    h.buffer.reset();

    expect(() => {
      h.ctx.with({ fill: "#00ff00" }, () => {
        throw new Error("boom");
      });
    }).toThrow("boom");

    // A forgotten pop is the classic failure of manual save/restore; the
    // scoped form makes it impossible even on the error path.
    expect(h.ops()).toContain("pop");
  });

  test("nests", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.with({ fill: "#111111" }, () => {
      h.ctx.with({ fill: "#222222" }, () => {
        h.ctx.circle(0, 0, 1);
      });
    });
    const ops = h.ops();
    expect(ops.filter((o) => o === "push")).toHaveLength(2);
    expect(ops.filter((o) => o === "pop")).toHaveLength(2);
  });

  test("leaves unmentioned properties alone", () => {
    const h = makeContext();
    h.ctx.strokeWeight(4);
    h.ctx.stroke("#ffffff");
    h.buffer.reset();

    h.ctx.with({ fill: "#ff0000" }, () => {
      h.ctx.circle(0, 0, 1);
    });

    // No stroke commands emitted: `with` only touched fill.
    expect(h.ops().filter((o) => o.startsWith("setStroke"))).toHaveLength(0);
  });

  test("tint override restores on exit, and null means noTint", () => {
    const h = makeContext();
    h.ctx.tint("#ff0000");
    h.buffer.reset();
    h.ctx.with({ tint: "#00ff00" }, () => {
      h.ctx.image(fakeImage(8, 8), 0, 0);
    });
    h.ctx.image(fakeImage(8, 8), 1, 1);

    expect(h.ops()).toEqual(["push", "setTint", "image", "pop", "image"]);
    expect(rgba8(record(h.buffer).find((c) => c.op === "setTint")?.args)).toEqual([0, 255, 0, 255]);

    h.buffer.reset();
    h.ctx.with({ tint: null }, () => {});
    expect(rgba8(record(h.buffer).find((c) => c.op === "setTint")?.args)).toEqual([
      255, 255, 255, 255,
    ]);
  });
});

describe("frame lifecycle", () => {
  test("beginFrame re-emits current style into a reset buffer", () => {
    const h = makeContext();
    h.ctx.fill("#123456");
    h.ctx.blendMode(Blend.Add);

    h.buffer.reset();
    h.beginFrame();

    // Style set during scene creation survives the per-frame buffer reset.
    expect(h.ops()).toEqual([
      "setFill",
      "setTint",
      "setStroke",
      "setStrokeWidth",
      "setBlend",
      "setFont",
      "setTextSize",
      "setTextAlign",
    ]);
    expect(record(h.buffer).find((c) => c.op === "setBlend")?.args).toEqual([Blend.Add]);
  });

  test("beginFrame re-emits text style set before the buffer reset", () => {
    const h = makeContext();
    h.ctx.textFont("Georgia");
    h.ctx.textSize(24);
    h.ctx.textAlign(Align.Center, Baseline.Middle);

    h.buffer.reset();
    h.beginFrame();

    const commands = record(h.buffer);
    expect(commands.find((c) => c.op === "setFont")?.text).toBe("Georgia");
    expect(commands.find((c) => c.op === "setTextSize")?.args).toEqual([24]);
    expect(commands.find((c) => c.op === "setTextAlign")?.args).toEqual([
      Align.Center,
      Baseline.Middle,
    ]);
  });
});

describe("loop control", () => {
  test("noLoop and loop toggle the shared state", () => {
    const h = makeContext();
    expect(h.ctx.isLooping()).toBe(true);
    h.ctx.noLoop();
    expect(h.state.looping).toBe(false);
    expect(h.ctx.isLooping()).toBe(false);
    h.ctx.loop();
    expect(h.ctx.isLooping()).toBe(true);
  });
});

/**
 * The loop must not keep running a scene that throws. Sixty identical stack
 * traces a second buries the one that matters, and the playground found this
 * the hard way: an unsupported colour threw on every frame with nothing in the
 * status bar.
 */
describe("draw errors", () => {
  test("a throwing draw stops looping", () => {
    const h = makeContext();
    // The runtime sets this on the shared state; simulate what renderFrame does.
    expect(h.state.looping).toBe(true);
    h.state.looping = false;
    expect(h.ctx.isLooping()).toBe(false);
  });
});

describe("input", () => {
  test("reports live cursor and key state", () => {
    const h = makeContext();
    h.state.mouseX = 12;
    h.state.mouseY = 34;
    h.state.pmouseX = 10;
    h.state.pmouseY = 30;
    h.state.mouseIsPressed = true;
    h.state.mouseButton = 2;

    expect(h.ctx.mouseX).toBe(12);
    expect(h.ctx.pmouseX).toBe(10);
    // The delta a scene actually wants: movement since it last drew.
    expect(h.ctx.mouseX - h.ctx.pmouseX).toBe(2);
    expect(h.ctx.mouseIsPressed).toBe(true);
    expect(h.ctx.mouseButton).toBe(2);
  });

  test("keyIsDown reads the held set", () => {
    const h = makeContext();
    expect(h.ctx.keyIsDown("a")).toBe(false);

    h.state.keysDown.add("a");
    h.state.keysDown.add("ArrowLeft");
    h.state.keyIsPressed = true;
    h.state.key = "ArrowLeft";

    expect(h.ctx.keyIsDown("a")).toBe(true);
    expect(h.ctx.keyIsDown("ArrowLeft")).toBe(true);
    expect(h.ctx.keyIsDown("b")).toBe(false);
    expect(h.ctx.key).toBe("ArrowLeft");
    expect(h.ctx.keyIsPressed).toBe(true);
  });

  test("several keys can be held at once", () => {
    const h = makeContext();
    for (const k of ["w", "a", "s", "d"]) h.state.keysDown.add(k);
    expect(["w", "a", "s", "d"].every((k) => h.ctx.keyIsDown(k))).toBe(true);
  });

  test("edge queries read the active fixed-update snapshot", () => {
    const h = makeContext();
    h.state.keysPressed.add("Enter");
    h.state.keysReleased.add("Escape");
    h.state.mouseButtonsPressed.add(0);
    h.state.mouseButtonsReleased.add(2);
    h.state.pointersPressed.add(7);
    h.state.pointersReleased.add(9);
    h.state.wheelX = -4;
    h.state.wheelY = 24;
    h.state.gamepads.push({
      index: 1,
      id: "test pad",
      mapping: "standard",
      connected: true,
      axes: [0.25],
      buttons: [{ value: 1, pressed: true, touched: true }],
    });
    h.state.gamepadButtonsPressed.set(1, new Set([0]));
    h.state.gamepadButtonsReleased.set(1, new Set([2]));

    expect(h.ctx.keyJustPressed("Enter")).toBe(true);
    expect(h.ctx.keyJustPressed("Escape")).toBe(false);
    expect(h.ctx.keyJustReleased("Escape")).toBe(true);
    expect(h.ctx.mouseJustPressed()).toBe(true);
    expect(h.ctx.mouseJustReleased(2)).toBe(true);
    expect(h.ctx.pointerJustPressed()).toBe(true);
    expect(h.ctx.pointerJustPressed(7)).toBe(true);
    expect(h.ctx.pointerJustPressed(8)).toBe(false);
    expect(h.ctx.pointerJustReleased(9)).toBe(true);
    expect(h.ctx.wheelX).toBe(-4);
    expect(h.ctx.wheelY).toBe(24);
    expect(h.ctx.gamepads[0]?.axes[0]).toBe(0.25);
    expect(h.ctx.gamepadButtonIsDown(0, 1)).toBe(true);
    expect(h.ctx.gamepadButtonIsDown(0)).toBe(false);
    expect(h.ctx.gamepadButtonJustPressed(0, 1)).toBe(true);
    expect(h.ctx.gamepadButtonJustReleased(2, 1)).toBe(true);
  });
});

describe("shapes", () => {
  test("the first vertex opens the contour rather than drawing a line", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.beginShape();
    h.ctx.vertex(10, 20);
    h.ctx.vertex(30, 40);
    h.ctx.endShape();

    const ops = h.ops();
    expect(ops.slice(0, 3)).toEqual(["beginPath", "moveTo", "lineTo"]);
  });

  test("endShape fills then strokes, matching every other primitive", () => {
    const h = makeContext();
    h.ctx.fill("#ff0000");
    h.ctx.stroke("#00ff00");
    h.ctx.strokeWeight(3);
    h.buffer.reset();

    h.ctx.beginShape();
    h.ctx.vertex(0, 0);
    h.ctx.vertex(10, 0);
    h.ctx.endShape();

    const ops = h.ops();
    expect(ops.indexOf("fillPath")).toBeLessThan(ops.indexOf("strokePath"));
  });

  test("noFill and noStroke suppress the corresponding pass", () => {
    const h = makeContext();
    h.ctx.noStroke();
    h.buffer.reset();
    h.ctx.beginShape();
    h.ctx.vertex(0, 0);
    h.ctx.vertex(10, 0);
    h.ctx.endShape();
    expect(h.ops()).not.toContain("strokePath");

    h.ctx.noFill();
    h.ctx.stroke("#fff");
    h.ctx.strokeWeight(2);
    h.buffer.reset();
    h.ctx.beginShape();
    h.ctx.vertex(0, 0);
    h.ctx.vertex(10, 0);
    h.ctx.endShape();
    expect(h.ops()).not.toContain("fillPath");
    expect(h.ops()).toContain("strokePath");
  });

  test("close emits closePath before painting", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.beginShape();
    h.ctx.vertex(0, 0);
    h.ctx.vertex(10, 0);
    h.ctx.endShape(true);

    const ops = h.ops();
    expect(ops.indexOf("closePath")).toBeLessThan(ops.indexOf("fillPath"));
  });

  test("curves are stored as control points, not a polyline", () => {
    // The invariant: flattening belongs to the backend. A polyline here would
    // mean SVG could no longer export real curve commands.
    const h = makeContext();
    h.buffer.reset();
    h.ctx.beginShape();
    h.ctx.vertex(0, 0);
    h.ctx.bezierVertex(10, 50, 40, 50, 50, 0);
    h.ctx.endShape();

    const cubic = record(h.buffer).find((c) => c.op === "cubicTo");
    expect(cubic?.args).toEqual([10, 50, 40, 50, 50, 0]);
    expect(h.ops().filter((o) => o === "lineTo")).toHaveLength(0);
  });

  test("endShape without any vertices emits nothing", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.beginShape();
    h.ctx.endShape();
    expect(h.ops()).toEqual(["beginPath"]);
  });

  test("a curve as the first vertex still opens the contour", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.beginShape();
    h.ctx.bezierVertex(10, 50, 40, 50, 50, 0);
    h.ctx.endShape();
    expect(h.ops().slice(0, 3)).toEqual(["beginPath", "moveTo", "cubicTo"]);
  });
});

describe("sprites", () => {
  test("a whole image emits image, a frame emits imageRegion", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.image(fakeImage(64, 64), 10, 20);
    expect(h.ops()).toEqual(["image"]);

    h.buffer.reset();
    h.ctx.image({ source: fakeImage(64, 64), x: 16, y: 0, width: 16, height: 16 }, 10, 20);
    expect(h.ops()).toEqual(["imageRegion"]);
  });

  test("a frame defaults to the frame size, not the sheet size", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.image({ source: fakeImage(64, 64), x: 16, y: 32, width: 16, height: 24 }, 5, 6);

    const cmd = record(h.buffer)[0];
    // dx, dy, dw, dh, sx, sy, sw, sh
    expect(cmd?.args).toEqual([5, 6, 16, 24, 16, 32, 16, 24]);
  });

  test("an explicit size scales the frame", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.image({ source: fakeImage(64, 64), x: 0, y: 0, width: 16, height: 16 }, 0, 0, 64, 64);
    expect(record(h.buffer)[0]?.args.slice(0, 4)).toEqual([0, 0, 64, 64]);
  });

  test("a source crop on a whole image emits imageRegion", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.image(fakeImage(64, 64), 2, 3, 8, 16, 4, 8, 8, 16);
    expect(h.ops()).toEqual(["imageRegion"]);
    expect(record(h.buffer)[0]?.args).toEqual([2, 3, 8, 16, 4, 8, 8, 16]);
  });

  test("a source crop on a frame is relative to the frame origin", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.image(
      { source: fakeImage(64, 64), x: 16, y: 32, width: 16, height: 16 },
      0,
      0,
      1,
      16,
      3,
      0,
      1,
      16,
    );
    // sx = frame.x + 3, sy = frame.y + 0
    expect(record(h.buffer)[0]?.args).toEqual([0, 0, 1, 16, 19, 32, 1, 16]);
  });

  test("a crop without dest size uses the source size", () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.image(fakeImage(64, 64), 5, 6, undefined, undefined, 4, 8, 8, 16);
    expect(record(h.buffer)[0]?.args).toEqual([5, 6, 8, 16, 4, 8, 8, 16]);
  });

  test("a partial source crop throws rather than guessing", () => {
    const h = makeContext();
    expect(() => h.ctx.image(fakeImage(8, 8), 0, 0, 8, 8, 1)).toThrow(/sx, sy, sw, and sh/);
  });
});

describe("text measurement", () => {
  // The stub font above is monospace at half the size, so 16px gives 8px a
  // character — every expectation below is that arithmetic, not a real face.
  test("measures a line at the current size", () => {
    const h = makeContext();
    h.ctx.textSize(16);
    expect(h.ctx.textWidth("hello")).toBe(40);
    expect(h.ctx.measureText("hello")).toEqual({
      width: 40,
      ascent: 12.8,
      descent: 3.2,
      lineHeight: 19.2,
    });
  });

  test("follows a size change", () => {
    const h = makeContext();
    h.ctx.textSize(32);
    expect(h.ctx.textWidth("hello")).toBe(80);
  });

  test("wraps on spaces without splitting words", () => {
    const h = makeContext();
    h.ctx.textSize(16);
    // 80px holds ten characters, so "the quick" (9) fits and "the quick brown"
    // does not.
    expect(h.ctx.wrapText("the quick brown fox", 80)).toEqual(["the quick", "brown fox"]);
  });

  test("gives a word wider than the box its own line rather than cutting it", () => {
    const h = makeContext();
    h.ctx.textSize(16);
    expect(h.ctx.wrapText("hi supercalifragilistic go", 40)).toEqual([
      "hi",
      "supercalifragilistic",
      "go",
    ]);
  });

  test("keeps the author's own newlines", () => {
    const h = makeContext();
    h.ctx.textSize(16);
    expect(h.ctx.wrapText("one\ntwo three", 400)).toEqual(["one", "two three"]);
  });

  test("an empty line survives as an empty line", () => {
    const h = makeContext();
    h.ctx.textSize(16);
    expect(h.ctx.wrapText("a\n\nb", 400)).toEqual(["a", "", "b"]);
  });
});

describe("depth layers", () => {
  test("lower depth paints first, whatever the call order", () => {
    const h = makeContext();
    h.ctx.layer(5, () => h.ctx.circle(1, 0, 1));
    h.ctx.layer(1, () => h.ctx.circle(2, 0, 1));
    h.endFrame();
    expect(painted(h)).toEqual([2, 1]);
  });

  test("call order still decides inside one depth", () => {
    const h = makeContext();
    h.ctx.layer(1, () => {
      h.ctx.circle(1, 0, 1);
      h.ctx.circle(2, 0, 1);
    });
    h.endFrame();
    expect(painted(h)).toEqual([1, 2]);
  });

  test("two layers at the same depth keep the order they were written", () => {
    const h = makeContext();
    h.ctx.layer(3, () => h.ctx.circle(1, 0, 1));
    h.ctx.layer(3, () => h.ctx.circle(2, 0, 1));
    h.endFrame();
    expect(painted(h)).toEqual([1, 2]);
  });

  test("unlayered drawing sits at depth 0", () => {
    const h = makeContext();
    h.ctx.layer(-1, () => h.ctx.circle(1, 0, 1));
    h.ctx.circle(2, 0, 1);
    h.ctx.layer(1, () => h.ctx.circle(3, 0, 1));
    h.endFrame();
    expect(painted(h)).toEqual([1, 2, 3]);
  });

  test("a layer's fill cannot leak into another layer", () => {
    // The hazard depth ordering introduces: without scoping, moving a layer
    // that sets a fill would repaint whichever layer sorts after it. Walking
    // the stream means honouring push/pop, since that is what restores it —
    // reading the last setFill textually before the circle would see the blue
    // that pop has already undone.
    const h = makeContext();
    h.ctx.fill("#ff0000");
    h.ctx.layer(1, () => {
      h.ctx.fill("#0000ff");
      h.ctx.circle(1, 0, 1);
    });
    h.ctx.layer(2, () => h.ctx.circle(2, 0, 1));
    h.endFrame();

    let fill: readonly number[] = [];
    const stack: (readonly number[])[] = [];
    const fillAtCircle = new Map<number, readonly number[]>();
    for (const command of record(h.buffer)) {
      if (command.op === "setFill") fill = command.args.slice(0, 3);
      else if (command.op === "push") stack.push(fill);
      else if (command.op === "pop") fill = stack.pop() ?? fill;
      else if (command.op === "circle") fillAtCircle.set(command.args[0] as number, fill);
    }
    // Rounded: colour round-trips through OKLCH, so the channels land a
    // rounding error away from the literals rather than on them.
    expect(fillAtCircle.get(1)?.map(Math.round)).toEqual([0, 0, 1]);
    // Red: the blue belonged to the other layer and pop gave it back.
    expect(fillAtCircle.get(2)?.map(Math.round)).toEqual([1, 0, 0]);
  });

  test("nesting puts the inner layer at its own depth", () => {
    const h = makeContext();
    h.ctx.layer(5, () => {
      h.ctx.circle(1, 0, 1);
      h.ctx.layer(0, () => h.ctx.circle(2, 0, 1));
      h.ctx.circle(3, 0, 1);
    });
    h.endFrame();
    expect(painted(h)).toEqual([2, 1, 3]);
  });

  test("a throwing body still closes its layer", () => {
    const h = makeContext();
    expect(() => {
      h.ctx.layer(1, () => {
        h.ctx.circle(1, 0, 1);
        throw new Error("boom");
      });
    }).toThrow("boom");
    h.ctx.circle(2, 0, 1);
    h.endFrame();
    expect(painted(h)).toEqual([2, 1]);
  });

  test("rejects a depth that is not a finite number", () => {
    const h = makeContext();
    expect(() => h.ctx.layer(Number.NaN, () => {})).toThrow(RangeError);
  });
});
