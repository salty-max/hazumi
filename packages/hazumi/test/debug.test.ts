import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { record, type RecordedCommand } from "@hazumi/backend-headless";
import { createPluginHost } from "@hazumi/core";
import type { CommandBuffer, Renderer } from "@hazumi/graphics";
import { start } from "../src/app";
import { overlay } from "../src/debug";
import { physics } from "../src/physics";

class TestCanvas extends EventTarget {
  width = 0;
  height = 0;
  removed = false;
  displayWidth = 0;
  displayHeight = 0;
  readonly style = { width: "", maxWidth: "", height: "", aspectRatio: "", touchAction: "" };

  getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      width: this.displayWidth,
      height: this.displayHeight,
    } as DOMRect;
  }

  remove(): void {
    this.removed = true;
  }
}

interface RuntimeHarness {
  readonly canvas: HTMLCanvasElement;
  readonly frames: RecordedCommand[][];
  readonly renderer: Renderer;
  runFrame: (nowMs: number) => void;
}

const originalDocument = globalThis.document;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

let callbacks: FrameRequestCallback[];

beforeEach(() => {
  callbacks = [];
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback): number => {
      callbacks.push(callback);
      return callbacks.length;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (): void => {},
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: originalRequestAnimationFrame,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: originalCancelAnimationFrame,
  });
});

function harness(): RuntimeHarness {
  const fakeCanvas = new TestCanvas();
  const canvas = fakeCanvas as unknown as HTMLCanvasElement;
  const frames: RecordedCommand[][] = [];
  const renderer: Renderer = {
    render: (buffer: CommandBuffer): void => {
      frames.push(record(buffer));
    },
    setViewport: (): void => {},
    dispose: (): void => {},
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (): HTMLCanvasElement => canvas,
      body: { append: (): void => {} },
    },
  });
  return {
    canvas,
    frames,
    renderer,
    runFrame: (nowMs: number): void => {
      const callback = callbacks.shift();
      if (callback === undefined) throw new Error("No animation frame is queued");
      callback(nowMs);
    },
  };
}

function lastFrame(h: RuntimeHarness): RecordedCommand[] {
  const frame = h.frames.at(-1);
  if (frame === undefined) throw new Error("No frame was recorded");
  return frame;
}

describe("overlay plugin", () => {
  test("draws stats after the scene and outlines physics bodies", async () => {
    const h = harness();
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        width: 320,
        height: 180,
        clock: { fixedStep: 0.01 },
        plugins: createPluginHost().use(physics()).use(overlay()),
      },
      ({ physics: sim }) => {
        sim.world.addCircle({ x: 80, y: 40, radius: 12 });
        return { draw: (): void => {} };
      },
    );

    await app.ready;
    h.runFrame(0);
    h.runFrame(20);

    const frame = lastFrame(h);
    expect(frame.some((command) => command.op === "circle")).toBe(true);
    expect(frame.some((command) => command.op === "text" && command.text?.includes("fps"))).toBe(
      true,
    );
    expect(frame.some((command) => command.op === "text" && command.text?.includes("bodies"))).toBe(
      true,
    );
    expect(frame.some((command) => command.op === "resetTransform")).toBe(true);
    app.stop();
  });

  test("hidden overlay encodes nothing extra", async () => {
    const h = harness();
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        plugins: createPluginHost().use(overlay({ visible: false })),
      },
      {
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    expect(lastFrame(h).some((command) => command.op === "text")).toBe(false);
    app.stop();
  });

  test("toggleKey flips visibility on a fixed update", async () => {
    const h = harness();
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.01 },
        plugins: createPluginHost().use(overlay({ toggleKey: "F1" })),
      },
      (context) => ({
        draw: (): void => {
          void context;
        },
      }),
    );

    await app.ready;
    h.runFrame(0);
    h.runFrame(20);
    expect(app.context.overlay.visible).toBe(true);
    expect(lastFrame(h).some((command) => command.op === "text")).toBe(true);

    const event = new Event("keydown");
    Object.defineProperty(event, "key", { value: "F1", configurable: true });
    globalThis.dispatchEvent(event);
    h.runFrame(40);
    expect(app.context.overlay.visible).toBe(false);
    expect(lastFrame(h).some((command) => command.op === "text")).toBe(false);
    app.stop();
  });
});
