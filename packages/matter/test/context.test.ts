import { beforeEach, describe, expect, test } from "bun:test";
import { Blend, CommandBuffer } from "@matter/graphics";
import { record } from "@matter/backend-headless";
import { ColorCache } from "../src/color-cache";
import { type ContextState, createContext, type MatterContext } from "../src/context";

function makeState(width: number, height: number): ContextState {
  return {
    width,
    height,
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
    looping: true,
  };
}

/**
 * The context is pure — buffer in, commands out — so the whole public drawing
 * API is testable in Node without a canvas. Assertions are on the recorded
 * command stream, which is what backend-headless exists for.
 */
function makeContext(): {
  ctx: MatterContext;
  buffer: CommandBuffer;
  state: ContextState;
  beginFrame: () => void;
  ops: () => string[];
} {
  const buffer = new CommandBuffer();
  const state: ContextState = makeState(400, 300);
  const { context, beginFrame } = createContext({
    buffer,
    colors: new ColorCache(),
    state,
    seed: 42,
    setPasses: () => {},
  });
  return {
    ctx: context,
    buffer,
    state,
    beginFrame,
    ops: () => record(buffer).map((c) => c.op),
  };
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
});

describe("frame lifecycle", () => {
  test("beginFrame re-emits current style into a reset buffer", () => {
    const h = makeContext();
    h.ctx.fill("#123456");
    h.ctx.blendMode(Blend.Add);

    h.buffer.reset();
    h.beginFrame();

    // Style set during scene creation survives the per-frame buffer reset.
    expect(h.ops()).toEqual(["setFill", "setStroke", "setStrokeWidth", "setBlend"]);
    expect(record(h.buffer).find((c) => c.op === "setBlend")?.args).toEqual([Blend.Add]);
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

    expect(h.ctx.keyJustPressed("Enter")).toBe(true);
    expect(h.ctx.keyJustPressed("Escape")).toBe(false);
    expect(h.ctx.keyJustReleased("Escape")).toBe(true);
    expect(h.ctx.mouseJustPressed()).toBe(true);
    expect(h.ctx.mouseJustReleased(2)).toBe(true);
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

const fakeImage = (w: number, h: number): never => ({ width: w, height: h }) as never;

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
});
