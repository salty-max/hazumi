import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { record, type RecordedCommand } from "@matter/backend-headless";
import { createPluginHost, definePlugin } from "@matter/core";
import type { CommandBuffer, Renderer } from "@matter/graphics";
import { start } from "../src/app";

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
const originalGetGamepads = globalThis.navigator.getGamepads;

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
  Object.defineProperty(globalThis.navigator, "getGamepads", {
    configurable: true,
    value: originalGetGamepads,
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

function inputEvent(type: string, properties: Readonly<Record<string, unknown>>): Event {
  const event = new Event(type);
  Object.defineProperties(
    event,
    Object.fromEntries(
      Object.entries(properties).map(([name, value]) => [name, { value, configurable: true }]),
    ),
  );
  return event;
}

describe("plugins", () => {
  test("installs typed contributions and dispatches the lifecycle", async () => {
    const h = harness();
    const log: string[] = [];
    const plugin = definePlugin({
      name: "score",
      setup: () => {
        log.push("setup");
        return { score: 7 };
      },
      presetup: () => void log.push("presetup"),
      postsetup: () => void log.push("postsetup"),
      predraw: () => void log.push("predraw"),
      postdraw: () => void log.push("postdraw"),
      dispose: () => void log.push("dispose"),
    });
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        plugins: createPluginHost().use(plugin),
      },
      (context) => {
        const score: number = context.score;
        log.push(`scene:${score}`);
        return { draw: (): void => void log.push("draw") };
      },
    );

    await app.ready;
    expect(app.context.score).toBe(7);
    expect(log).toEqual(["setup", "presetup", "scene:7", "postsetup"]);

    h.runFrame(0);
    expect(log.slice(-3)).toEqual(["predraw", "draw", "postdraw"]);

    app.stop();
    expect(log.at(-1)).toBe("dispose");
  });

  test("rejects contributions that overwrite the built-in context", () => {
    const h = harness();
    const plugin = definePlugin({
      name: "conflict",
      setup: () => ({ circle: "not a drawing function" }),
    });

    expect(() =>
      start(
        {
          backend: () => h.renderer,
          canvas: h.canvas,
          plugins: createPluginHost().use(plugin),
        },
        { draw: (): void => {} },
      ),
    ).toThrow('Plugin contribution "circle" conflicts with MatterContext');
  });

  test("releases the renderer and owned canvas when plugin setup fails", () => {
    const h = harness();
    let rendererDisposed = false;
    const renderer: Renderer = {
      ...h.renderer,
      dispose: (): void => {
        rendererDisposed = true;
      },
    };
    const plugin = definePlugin({
      name: "broken",
      setup: (): Record<never, never> => {
        throw new Error("setup failed");
      },
    });

    expect(() =>
      start(
        { backend: () => renderer, plugins: createPluginHost().use(plugin) },
        { draw: (): void => {} },
      ),
    ).toThrow("setup failed");
    expect(rendererDisposed).toBe(true);
    expect((h.canvas as unknown as TestCanvas).removed).toBe(true);
  });
});

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
    expect(h.canvas.style.touchAction).toBe("none");

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
    const move = inputEvent("pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      pressure: 0,
      clientX: 200,
      clientY: 112.5,
    });

    await app.ready;
    h.canvas.dispatchEvent(move);

    expect(app.context.mouseX).toBe(400);
    expect(app.context.mouseY).toBe(225);
    expect(app.context.pointers[0]).toMatchObject({
      id: 1,
      type: "mouse",
      x: 400,
      y: 225,
      isPrimary: true,
      isPressed: false,
    });

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

describe("input transitions", () => {
  test("a key edge belongs to one fixed update, even during catch-up", async () => {
    const h = harness();
    const snapshots: Array<readonly [boolean, boolean, boolean]> = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      {
        update: (_dt, { keyIsDown, keyJustPressed, keyJustReleased }): void => {
          snapshots.push([keyIsDown("a"), keyJustPressed("a"), keyJustReleased("a")]);
        },
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    globalThis.dispatchEvent(inputEvent("keydown", { key: "a" }));
    h.runFrame(350);

    expect(snapshots).toEqual([
      [true, true, false],
      [true, false, false],
      [true, false, false],
    ]);

    // Browser key repeat must not manufacture a second press edge.
    globalThis.dispatchEvent(inputEvent("keydown", { key: "a", repeat: true }));
    h.runFrame(450);
    expect(snapshots.at(-1)).toEqual([true, false, false]);

    globalThis.dispatchEvent(inputEvent("keyup", { key: "a" }));
    h.runFrame(550);
    expect(snapshots.at(-1)).toEqual([false, false, true]);

    app.stop();
  });

  test("a press and release between ticks are both observable", async () => {
    const h = harness();
    const snapshots: Array<readonly [boolean, boolean, boolean]> = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      {
        update: (_dt, { keyIsDown, keyJustPressed, keyJustReleased }): void => {
          snapshots.push([keyIsDown("x"), keyJustPressed("x"), keyJustReleased("x")]);
        },
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    globalThis.dispatchEvent(inputEvent("keydown", { key: "x" }));
    globalThis.dispatchEvent(inputEvent("keyup", { key: "x" }));
    h.runFrame(120);

    expect(snapshots).toEqual([[false, true, true]]);
    app.stop();
  });

  test("mouse button edges survive a click between ticks", async () => {
    const h = harness();
    const snapshots: Array<readonly [boolean, boolean, boolean]> = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      {
        update: (_dt, { mouseIsPressed, mouseJustPressed, mouseJustReleased }): void => {
          snapshots.push([mouseIsPressed, mouseJustPressed(2), mouseJustReleased(2)]);
        },
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    // Global release listeners must ignore contacts that began on another app.
    globalThis.dispatchEvent(inputEvent("pointerup", { pointerId: 999 }));
    expect(app.context.pointers).toHaveLength(0);
    h.canvas.dispatchEvent(
      inputEvent("pointerdown", {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        pressure: 0.5,
        clientX: 0,
        clientY: 0,
        button: 2,
        buttons: 2,
      }),
    );
    globalThis.dispatchEvent(
      inputEvent("pointerup", {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        pressure: 0,
        clientX: 0,
        clientY: 0,
        button: 2,
        buttons: 0,
      }),
    );
    h.runFrame(120);

    expect(snapshots).toEqual([[false, true, true]]);
    app.stop();
  });

  test("simultaneous touches keep their final positions for the release update", async () => {
    const h = harness();
    const canvas = h.canvas as unknown as TestCanvas;
    canvas.displayWidth = 200;
    canvas.displayHeight = 100;
    const snapshots: Array<
      readonly [boolean, boolean, number, number | undefined, boolean | undefined]
    > = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        width: 400,
        height: 200,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      {
        update: (_dt, { pointerJustPressed, pointerJustReleased, pointers }): void => {
          snapshots.push([
            pointerJustPressed(7),
            pointerJustReleased(7),
            pointers.length,
            pointers[0]?.x,
            pointers[0]?.isPressed,
          ]);
        },
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    h.canvas.dispatchEvent(
      inputEvent("pointerdown", {
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        pressure: 0.8,
        clientX: 50,
        clientY: 25,
        button: 0,
        buttons: 1,
      }),
    );
    h.canvas.dispatchEvent(
      inputEvent("pointerdown", {
        pointerId: 8,
        pointerType: "touch",
        isPrimary: false,
        pressure: 0.7,
        clientX: 150,
        clientY: 75,
        button: 0,
        buttons: 1,
      }),
    );
    h.runFrame(120);

    h.canvas.dispatchEvent(
      inputEvent("pointermove", {
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        pressure: 0.6,
        clientX: 75,
        clientY: 25,
        button: -1,
        buttons: 1,
      }),
    );
    globalThis.dispatchEvent(
      inputEvent("pointerup", {
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        pressure: 0,
        clientX: 100,
        clientY: 25,
        button: 0,
        buttons: 0,
      }),
    );
    globalThis.dispatchEvent(
      inputEvent("pointerup", {
        pointerId: 8,
        pointerType: "touch",
        isPrimary: false,
        pressure: 0,
        clientX: 150,
        clientY: 75,
        button: 0,
        buttons: 0,
      }),
    );
    // Browsers may emit leave immediately after release; final positions must
    // still survive until the fixed update consumes the release edge.
    h.canvas.dispatchEvent(inputEvent("pointerleave", { pointerId: 7 }));
    h.canvas.dispatchEvent(inputEvent("pointerleave", { pointerId: 8 }));
    h.runFrame(240);
    h.runFrame(360);

    expect(snapshots).toEqual([
      [true, false, 2, 100, true],
      [false, true, 2, 200, false],
      [false, false, 0, undefined, undefined],
    ]);
    app.stop();
  });

  test("wheel deltas accumulate once and normalize line units", async () => {
    const h = harness();
    const snapshots: Array<readonly [number, number]> = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      {
        update: (_dt, { wheelX, wheelY }): void => void snapshots.push([wheelX, wheelY]),
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    h.canvas.dispatchEvent(inputEvent("wheel", { deltaX: 2, deltaY: 3, deltaMode: 0 }));
    h.canvas.dispatchEvent(inputEvent("wheel", { deltaX: -1, deltaY: 2, deltaMode: 1 }));
    h.runFrame(120);
    h.runFrame(240);

    expect(snapshots).toEqual([
      [-14, 35],
      [0, 0],
    ]);
    app.stop();
  });

  test("gamepad buttons expose fixed-update edges and release on disconnect", async () => {
    const h = harness();
    const button = { value: 1, pressed: true, touched: true };
    const axes = [0.25];
    const native = {
      index: 1,
      id: "test pad",
      mapping: "standard",
      connected: true,
      axes,
      buttons: [button],
    } as unknown as Gamepad;
    let nativeGamepads: Array<Gamepad | null> = [];
    Object.defineProperty(globalThis.navigator, "getGamepads", {
      configurable: true,
      value: (): Array<Gamepad | null> => nativeGamepads,
    });

    const snapshots: Array<
      readonly [
        number,
        boolean | undefined,
        number | undefined,
        number | undefined,
        boolean,
        boolean,
        boolean,
      ]
    > = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      {
        update: (
          _dt,
          {
            gamepads,
            gamepadButtonIsDown,
            gamepadButtonJustPressed,
            gamepadButtonJustReleased,
          },
        ): void => {
          snapshots.push([
            gamepads.length,
            gamepads[0]?.connected,
            gamepads[0]?.axes[0],
            gamepads[0]?.buttons[0]?.value,
            gamepadButtonIsDown(0, 1),
            gamepadButtonJustPressed(0, 1),
            gamepadButtonJustReleased(0, 1),
          ]);
        },
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    nativeGamepads = [native];
    h.runFrame(120);
    axes[0] = -0.5;
    button.value = 0.7;
    h.runFrame(240);
    nativeGamepads = [null];
    h.runFrame(360);
    h.runFrame(480);

    expect(snapshots).toEqual([
      [1, true, 0.25, 1, true, true, false],
      [1, true, -0.5, 0.7, true, false, false],
      [1, false, -0.5, 0, false, false, true],
      [0, undefined, undefined, undefined, false, false, false],
    ]);
    app.stop();
  });

  test("blur releases held inputs on the next update", async () => {
    const h = harness();
    const releases: boolean[] = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      {
        update: (_dt, { keyJustReleased }): void => void releases.push(keyJustReleased("w")),
        draw: (): void => {},
      },
    );

    await app.ready;
    h.runFrame(0);
    globalThis.dispatchEvent(inputEvent("keydown", { key: "w" }));
    h.runFrame(120);
    globalThis.dispatchEvent(new Event("blur"));
    h.runFrame(240);

    expect(releases).toEqual([false, true]);
    expect(app.context.keyIsDown("w")).toBe(false);
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
