import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { record, type RecordedCommand } from "@matter/backend-headless";
import type { CommandBuffer, Renderer } from "@matter/graphics";
import { start } from "../src/app";

class TestCanvas extends EventTarget {
  width = 0;
  height = 0;
  removed = false;
  displayWidth = 0;
  displayHeight = 0;
  readonly style = { width: "", maxWidth: "", height: "", aspectRatio: "" };

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

describe("canvas sizing", () => {
  test("preserves the logical aspect ratio when CSS constrains its width", async () => {
    const h = harness();
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        width: 800,
        height: 450,
        pixelRatio: 2,
      },
      { draw: (): void => {} },
    );

    await app.ready;

    expect(h.canvas.width).toBe(1600);
    expect(h.canvas.height).toBe(900);
    expect(h.canvas.style.width).toBe("800px");
    expect(h.canvas.style.maxWidth).toBe("100%");
    expect(h.canvas.style.height).toBe("auto");
    expect(h.canvas.style.aspectRatio).toBe("800 / 450");

    app.stop();
  });

  test("maps pointer coordinates back into logical canvas space", async () => {
    const h = harness();
    const canvas = h.canvas as unknown as TestCanvas;
    canvas.displayWidth = 400;
    canvas.displayHeight = 225;
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas, width: 800, height: 450 },
      { draw: (): void => {} },
    );
    const move = new Event("mousemove");
    Object.defineProperties(move, {
      clientX: { value: 200 },
      clientY: { value: 112.5 },
    });

    await app.ready;
    h.canvas.dispatchEvent(move);

    expect(app.context.mouseX).toBe(400);
    expect(app.context.mouseY).toBe(225);

    app.stop();
  });

  test("removes an owned canvas even when renderer disposal throws", async () => {
    const h = harness();
    const renderer: Renderer = {
      ...h.renderer,
      dispose: (): void => {
        throw new Error("dispose failed");
      },
    };
    const app = start({ backend: () => renderer }, { draw: (): void => {} });
    await app.ready;

    expect(() => app.stop()).toThrow("dispose failed");
    expect((h.canvas as unknown as TestCanvas).removed).toBe(true);
  });
});

describe("fixed loop", () => {
  test("validates timing before acquiring the renderer", () => {
    const h = harness();
    let acquisitions = 0;

    expect(() =>
      start(
        {
          backend: () => {
            acquisitions++;
            return h.renderer;
          },
          canvas: h.canvas,
          clock: { fixedStep: 0 },
        },
        { draw: (): void => {} },
      ),
    ).toThrow(RangeError);
    expect(acquisitions).toBe(0);
  });

  test("updates at a fixed rate and draws once with the remainder alpha", async () => {
    const h = harness();
    const updates: number[] = [];
    const alphas: number[] = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      () => ({
        update: (dt, context): void => {
          updates.push(dt);
          // Commands emitted from update must not leak into the draw stream.
          context.rect(0, 0, 10, 10);
        },
        draw: (alpha, context): void => {
          alphas.push(alpha);
          context.circle(20, 20, 10);
        },
      }),
    );

    await app.ready;
    h.runFrame(0);
    h.runFrame(350);

    expect(updates).toEqual([0.1, 0.1, 0.1]);
    expect(alphas).toHaveLength(2);
    expect(alphas[0]).toBe(0);
    expect(alphas[1]).toBeCloseTo(0.5);
    expect(h.frames).toHaveLength(2);
    expect(h.frames[1]?.filter((command) => command.op === "circle")).toHaveLength(1);
    expect(h.frames[1]?.some((command) => command.op === "rect")).toBe(false);

    app.stop();
  });

  test("caps catch-up work and drops unaffordable time", async () => {
    const h = harness();
    let updates = 0;
    let alpha = -1;
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.01, maxDelta: 1, maxFixedSteps: 3 },
      },
      () => ({
        update: (): void => {
          updates++;
        },
        draw: (remainder): void => {
          alpha = remainder;
        },
      }),
    );

    await app.ready;
    h.runFrame(0);
    h.runFrame(1000);

    expect(updates).toBe(3);
    expect(alpha).toBe(0);

    app.stop();
  });

  test("an update error stops the loop and reaches onError", async () => {
    const h = harness();
    const errors: unknown[] = [];
    let draws = 0;
    const failure = new Error("update failed");
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.01 },
        onError: (error): void => void errors.push(error),
      },
      () => ({
        update: (): void => {
          throw failure;
        },
        draw: (): void => {
          draws++;
        },
      }),
    );

    await app.ready;
    h.runFrame(0);
    h.runFrame(20);
    h.runFrame(40);

    expect(errors).toEqual([failure]);
    expect(draws).toBe(1);
    expect(app.context.isLooping()).toBe(false);

    app.stop();
  });
});

describe("draw-only scenes", () => {
  test("receives the live context on every frame", async () => {
    const h = harness();
    const deltas: number[] = [];
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas },
      {
        draw: (_alpha, context): void => void deltas.push(context.dt),
      },
    );

    await app.ready;
    h.runFrame(100);
    h.runFrame(116);

    expect(deltas[0]).toBe(0);
    expect(deltas[1]).toBeCloseTo(0.016);

    app.stop();
  });
});

describe("scene switching", () => {
  test("activates the next scene and disposes both scenes exactly once", async () => {
    const h = harness();
    const draws: string[] = [];
    let firstDisposals = 0;
    let secondDisposals = 0;
    const second = {
      draw: (): void => void draws.push("second"),
      dispose: (): void => void secondDisposals++,
    };
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas },
      {
        draw: (): void => void draws.push("first"),
        dispose: (): void => void firstDisposals++,
      },
    );

    await app.ready;
    h.runFrame(0);
    await app.setScene(second);
    h.runFrame(16);

    expect(draws).toEqual(["first", "second"]);
    expect(app.scene).toBe(second);
    expect(firstDisposals).toBe(1);

    app.stop();
    app.stop();
    expect(secondDisposals).toBe(1);
  });

  test("a scene that finishes loading late cannot replace a newer one", async () => {
    const h = harness();
    let release: ((scene: { draw: () => void; dispose: () => void }) => void) | undefined;
    let staleDisposals = 0;
    const current = { draw: (): void => {} };
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, current);
    await app.ready;

    const stale = app.setScene(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const latest = { draw: (): void => {} };
    await app.setScene(latest);
    release?.({
      draw: (): void => {},
      dispose: (): void => void staleDisposals++,
    });
    await stale;

    expect(app.scene).toBe(latest);
    expect(staleDisposals).toBe(1);
    app.stop();
  });

  test("a stale loading error cannot tear down a newer scene", async () => {
    const h = harness();
    let reject: ((error: Error) => void) | undefined;
    const errors: unknown[] = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        onError: (error): void => void errors.push(error),
      },
      { draw: (): void => {} },
    );
    await app.ready;

    const stale = app.setScene(
      () =>
        new Promise((_resolve, rejectScene) => {
          reject = rejectScene;
        }),
    );
    const latest = { draw: (): void => {} };
    await app.setScene(latest);
    reject?.(new Error("stale failure"));
    await stale;

    expect(errors).toEqual([]);
    expect(app.scene).toBe(latest);
    app.stop();
  });

  test("reports a scene loading error and keeps the current scene active", async () => {
    const h = harness();
    const errors: unknown[] = [];
    const current = { draw: (): void => {} };
    const failure = new Error("scene failed to load");
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        onError: (error): void => void errors.push(error),
      },
      current,
    );
    await app.ready;

    await expect(app.setScene(async () => Promise.reject(failure))).rejects.toBe(failure);

    expect(errors).toEqual([failure]);
    expect(app.scene).toBe(current);
    app.stop();
  });

  test("disposes a scene that finishes loading after the application stops", async () => {
    const h = harness();
    let release: ((scene: { draw: () => void; dispose: () => void }) => void) | undefined;
    let disposals = 0;
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, { draw: (): void => {} });
    await app.ready;

    const loading = app.setScene(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    app.stop();
    release?.({
      draw: (): void => {},
      dispose: (): void => void disposals++,
    });
    await loading;

    expect(disposals).toBe(1);
    expect(app.scene).toBeNull();
  });
});
