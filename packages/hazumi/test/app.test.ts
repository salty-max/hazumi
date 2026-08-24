import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { record, type RecordedCommand } from "@hazumi/backend-headless";
import { createPluginHost, definePlugin } from "@hazumi/core";
import type { CommandBuffer, RenderOptions, Renderer, ShaderPass } from "@hazumi/graphics";
import { ShaderPassesUnavailableError, TextMeasurementUnavailableError, start } from "../src/app";
import { PixelAccessUnavailableError, Pixels } from "../src/pixels";
import { background, circle, fill, measureText, textSize, textWidth } from "../src/draw";
import {
  input,
  keyIsDown as activeKeyIsDown,
  keyJustPressed as activeKeyJustPressed,
} from "../src/input";
import { camera, random, screen, setPasses, time } from "../src/scene";

class TestCanvas extends EventTarget {
  width = 0;
  height = 0;
  removed = false;
  displayWidth = 0;
  displayHeight = 0;
  tabIndex = -1;
  focused = false;
  readonly style = {
    width: "",
    maxWidth: "",
    height: "",
    aspectRatio: "",
    touchAction: "",
    userSelect: "",
  };

  focus(options?: { preventScroll?: boolean }): void {
    this.focused = true;
    void options;
  }

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
  /** The options each `render` was called with, in the same order as frames. */
  readonly renderOptions: (RenderOptions | undefined)[];
  readonly viewports: Array<readonly [number, number]>;
  readonly renderer: Renderer;
  runFrame: (nowMs: number) => void;
}

const originalDocument = globalThis.document;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalGetGamepads = globalThis.navigator.getGamepads;
const originalDevicePixelRatio = globalThis.devicePixelRatio;

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
  Object.defineProperty(globalThis, "devicePixelRatio", {
    configurable: true,
    value: originalDevicePixelRatio,
  });
});

function harness(): RuntimeHarness {
  const fakeCanvas = new TestCanvas();
  const canvas = fakeCanvas as unknown as HTMLCanvasElement;
  const frames: RecordedCommand[][] = [];
  const renderOptions: (RenderOptions | undefined)[] = [];
  const viewports: Array<readonly [number, number]> = [];
  const renderer: Renderer = {
    render: (buffer: CommandBuffer, options?: RenderOptions): void => {
      frames.push(record(buffer));
      renderOptions.push(options);
    },
    setViewport: (width: number, height: number): void => {
      viewports.push([width, height]);
    },
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
    renderOptions,
    viewports,
    renderer,
    runFrame: (nowMs: number): void => {
      const callback = callbacks.shift();
      if (callback === undefined) throw new Error("No animation frame is queued");
      callback(nowMs);
    },
  };
}

function inputEvent(type: string, properties: Readonly<Record<string, unknown>>): Event {
  const event = new Event(type, { cancelable: properties.cancelable === true });
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

  test("runs update hooks on the fixed step, even without a scene update", async () => {
    const h = harness();
    const log: string[] = [];
    const plugin = definePlugin({
      name: "clock",
      preupdate: (fixedDt: number) => void log.push(`pre:${fixedDt}`),
      postupdate: (fixedDt: number) => void log.push(`post:${fixedDt}`),
    });
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.01 },
        plugins: createPluginHost().use(plugin),
      },
      { draw: (): void => {} },
    );

    await app.ready;
    h.runFrame(0);
    expect(log).toEqual([]);
    h.runFrame(25);
    expect(log).toEqual(["pre:0.01", "post:0.01", "pre:0.01", "post:0.01"]);

    app.stop();
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
    ).toThrow('Plugin contribution "circle" conflicts with HazumiContext');
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

  test("stop during ready skips postsetup", async () => {
    const h = harness();
    let postsetup = 0;
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const plugin = definePlugin({
      name: "slow",
      presetup: () =>
        new Promise<void>((resolve) => {
          release = resolve;
          started();
        }),
      postsetup: () => {
        postsetup++;
      },
    });
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        plugins: createPluginHost().use(plugin),
      },
      { draw: (): void => {} },
    );
    await began;
    app.stop();
    release();
    await app.ready;
    expect(postsetup).toBe(0);
    expect(app.stopped).toBe(true);
  });

  test("stop from draw does not render after dispose", async () => {
    const h = harness();
    let renders = 0;
    const renderer: Renderer = {
      ...h.renderer,
      render: (): void => {
        renders++;
      },
    };
    const app = start(
      { backend: () => renderer, canvas: h.canvas },
      {
        draw: (): void => {
          app.stop();
        },
      },
    );
    await app.ready;
    h.runFrame(0);
    expect(renders).toBe(0);
    expect(app.stopped).toBe(true);
  });
});

describe("capability imports", () => {
  test("expose the active factory, update, and draw context", async () => {
    const h = harness();
    const observations: Array<readonly [string, number]> = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        width: 320,
        height: 180,
        clock: { fixedStep: 0.01 },
      },
      () => {
        observations.push(["factory-width", screen.width]);
        observations.push(["seed", random.seed]);
        return {
          update: (dt): void => {
            observations.push(["update-dt", dt]);
            observations.push(["key-down", Number(activeKeyIsDown("ArrowRight"))]);
            observations.push(["key-edge", Number(activeKeyJustPressed("ArrowRight"))]);
            camera.lookAt(10, 20);
          },
          draw: (): void => {
            observations.push(["draw-width", screen.width]);
            observations.push(["frame", time.frame]);
            observations.push(["mouse-x", input.mouseX]);
            background("black");
            fill("white");
            circle(10, 20, 8);
          },
          dispose: (): void => {
            observations.push(["dispose-width", screen.width]);
          },
        };
      },
    );

    await app.ready;
    globalThis.dispatchEvent(inputEvent("keydown", { key: "ArrowRight" }));
    h.runFrame(0);
    h.runFrame(20);

    expect(observations).toContainEqual(["factory-width", 320]);
    expect(observations).toContainEqual(["seed", 1]);
    expect(observations).toContainEqual(["update-dt", 0.01]);
    expect(observations).toContainEqual(["key-down", 1]);
    expect(observations).toContainEqual(["key-edge", 1]);
    expect(observations).toContainEqual(["draw-width", 320]);
    expect(h.frames.at(-1)?.some((command) => command.op === "background")).toBe(true);
    expect(h.frames.at(-1)?.some((command) => command.op === "circle")).toBe(true);
    expect(() => screen.width).toThrow("active scene");

    globalThis.dispatchEvent(inputEvent("keyup", { key: "ArrowRight" }));
    app.stop();
    expect(observations).toContainEqual(["dispose-width", 320]);
  });

  test("clears the active context when draw throws", async () => {
    const h = harness();
    const failure = new Error("draw failed");
    const errors: unknown[] = [];
    const app = start(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        onError: (error): void => void errors.push(error),
      },
      {
        draw: (): never => {
          background("black");
          throw failure;
        },
      },
    );

    await app.ready;
    h.runFrame(0);

    expect(errors).toEqual([failure]);
    expect(() => screen.width).toThrow("active scene");
    app.stop();
  });

  test("capability imports survive an await in the factory", async () => {
    const h = harness();
    const observations: number[] = [];
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas, width: 320, height: 180 },
      async () => {
        await Promise.resolve();
        observations.push(screen.width);
        return { draw: (): void => {} };
      },
    );
    await app.ready;
    expect(observations).toEqual([320]);
    expect(() => screen.width).toThrow("active scene");
    app.stop();
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
    expect(h.canvas.style.userSelect).toBe("none");
    expect(h.canvas.tabIndex).toBe(0);

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

  test("resizes logical coordinates, backing pixels, camera, and viewport together", async () => {
    const h = harness();
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas, width: 400, height: 300, pixelRatio: 1 },
      { draw: (): void => {} },
    );
    await app.ready;

    app.resize(800, 450, 2);

    expect(app.context.width).toBe(800);
    expect(app.context.height).toBe(450);
    expect(app.context.pixelRatio).toBe(2);
    expect(app.context.camera.worldToScreen(40, 30)).toEqual({ x: 40, y: 30 });
    expect(h.canvas.width).toBe(1600);
    expect(h.canvas.height).toBe(900);
    expect(h.canvas.style.width).toBe("800px");
    expect(h.canvas.style.aspectRatio).toBe("800 / 450");
    expect(h.viewports).toEqual([
      [400, 300],
      [800, 450],
    ]);

    app.stop();
  });

  test("preserves a positioned camera and pointer mapping across resize", async () => {
    const h = harness();
    const canvas = h.canvas as unknown as TestCanvas;
    canvas.displayWidth = 400;
    canvas.displayHeight = 200;
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas, width: 400, height: 200 },
      { draw: (): void => {} },
    );
    await app.ready;
    app.context.camera.lookAt(90, 70);

    app.resize(800, 400);
    h.canvas.dispatchEvent(
      inputEvent("pointermove", {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        pressure: 0,
        clientX: 200,
        clientY: 100,
      }),
    );

    expect(app.context.camera.x).toBe(90);
    expect(app.context.camera.y).toBe(70);
    expect(app.context.camera.worldToScreen(90, 70)).toEqual({ x: 400, y: 200 });
    expect(app.context.mouseX).toBe(400);
    expect(app.context.mouseY).toBe(200);

    app.stop();
  });

  test("validates resize dimensions and caps pixel ratio", async () => {
    const h = harness();
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, { draw: (): void => {} });
    await app.ready;

    expect(() => app.resize(0, 100)).toThrow("width must be a finite positive number");
    expect(() => app.resize(100, Number.NaN)).toThrow("height must be a finite positive number");
    expect(() => app.resize(100, 100, 0)).toThrow("pixelRatio must be a finite positive number");
    app.resize(100, 50, 4);
    expect(app.context.pixelRatio).toBe(2);
    expect(h.canvas.width).toBe(200);
    expect(h.canvas.height).toBe(100);

    app.stop();
  });

  test("redraws a no-loop scene after resize clears its backing store", async () => {
    const h = harness();
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, (context) => {
      context.noLoop();
      return { draw: (): void => {} };
    });
    await app.ready;
    expect(h.frames).toHaveLength(1);

    app.resize(320, 180);

    expect(h.frames).toHaveLength(2);
    app.stop();
  });

  test("tracks display pixel ratio changes unless the ratio is explicit", async () => {
    Object.defineProperty(globalThis, "devicePixelRatio", { configurable: true, value: 1 });
    const h = harness();
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas, width: 100, height: 50 },
      { draw: (): void => {} },
    );
    await app.ready;

    Object.defineProperty(globalThis, "devicePixelRatio", { configurable: true, value: 2 });
    globalThis.dispatchEvent(new Event("resize"));

    expect(app.context.pixelRatio).toBe(2);
    expect(h.canvas.width).toBe(200);
    expect(h.canvas.height).toBe(100);
    expect(h.viewports.at(-1)).toEqual([100, 50]);

    app.stop();
    const viewportCount = h.viewports.length;
    Object.defineProperty(globalThis, "devicePixelRatio", { configurable: true, value: 1 });
    globalThis.dispatchEvent(new Event("resize"));
    expect(h.viewports).toHaveLength(viewportCount);
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

describe("pixels and capture", () => {
  test("loads a mutable snapshot and writes it back at physical resolution", async () => {
    const h = harness();
    let written: Uint8ClampedArray | undefined;
    const renderer: Renderer = {
      ...h.renderer,
      readPixels: () => ({
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]),
      }),
      writePixels: (pixels): void => {
        written = new Uint8ClampedArray(pixels.data);
      },
    };
    const app = start(
      { backend: () => renderer, canvas: h.canvas, width: 2, height: 1, pixelRatio: 1 },
      { draw: (): void => {} },
    );
    await app.ready;

    const pixels = app.loadPixels();
    expect(() => app.updatePixels(new Pixels(1, 1, 1))).toThrow(RangeError);
    pixels.set(1, 0, [9, 8, 7, 6]);
    app.updatePixels(pixels);

    expect(pixels).toBeInstanceOf(Pixels);
    expect(pixels.get(0, 0)).toEqual([1, 2, 3, 255]);
    expect(written).toEqual(new Uint8ClampedArray([1, 2, 3, 255, 9, 8, 7, 6]));
    app.stop();
  });

  test("rejects unsupported backends and access after stop", async () => {
    const h = harness();
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas, width: 2, height: 1, pixelRatio: 1 },
      { draw: (): void => {} },
    );
    await app.ready;

    expect(() => app.loadPixels()).toThrow(PixelAccessUnavailableError);
    expect(() => app.updatePixels(new Pixels(1, 1, 1))).toThrow(PixelAccessUnavailableError);
    app.stop();
    expect(() => app.loadPixels()).toThrow("after app.stop()");
  });

  test("encodes a PNG from read-back pixels instead of relying on the drawing buffer", async () => {
    const h = harness();
    const source = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);
    const renderer: Renderer = {
      ...h.renderer,
      readPixels: () => ({ width: 2, height: 1, data: new Uint8ClampedArray(source) }),
      writePixels: (): void => {},
    };
    const encoded = new Blob(["png"], { type: "image/png" });
    let encodedPixels: Uint8ClampedArray | undefined;
    const output = {
      width: 0,
      height: 0,
      getContext: (): CanvasRenderingContext2D =>
        ({
          createImageData: (width: number, height: number): ImageData =>
            ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
          putImageData: (image: ImageData): void => {
            encodedPixels = new Uint8ClampedArray(image.data);
          },
        }) as unknown as CanvasRenderingContext2D,
      toBlob: (callback: BlobCallback, type?: string): void => {
        expect(type).toBe("image/png");
        callback(encoded);
      },
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (): HTMLCanvasElement => output as unknown as HTMLCanvasElement,
        body: { append: (): void => {} },
      },
    });
    const app = start(
      { backend: () => renderer, canvas: h.canvas, width: 2, height: 1, pixelRatio: 1 },
      { draw: (): void => {} },
    );
    await app.ready;

    const blob = await app.capturePng();

    expect(blob).toBe(encoded);
    expect(output.width).toBe(2);
    expect(output.height).toBe(1);
    expect(encodedPixels).toEqual(source);
    app.stop();
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
          { gamepads, gamepadButtonIsDown, gamepadButtonJustPressed, gamepadButtonJustReleased },
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

  test("arrow keys and space do not scroll the hosting page", async () => {
    const h = harness();
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, { draw: (): void => {} });
    await app.ready;

    const arrow = inputEvent("keydown", { key: "ArrowDown", cancelable: true });
    globalThis.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);

    const space = inputEvent("keydown", { key: " ", cancelable: true });
    globalThis.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);

    const move = inputEvent("keydown", { key: "w", cancelable: true });
    globalThis.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);

    app.stop();
  });

  test("does not swallow arrows while a text field is focused", async () => {
    const h = harness();
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, { draw: (): void => {} });
    await app.ready;

    const arrow = inputEvent("keydown", {
      key: "ArrowDown",
      cancelable: true,
      target: { tagName: "TEXTAREA" },
    });
    globalThis.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false);

    app.stop();
  });

  test("a click on the canvas takes keyboard focus without scrolling to it", async () => {
    const h = harness();
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, { draw: (): void => {} });
    await app.ready;

    h.canvas.dispatchEvent(
      inputEvent("pointerdown", {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        pressure: 0.5,
        clientX: 0,
        clientY: 0,
        button: 0,
        buttons: 1,
      }),
    );
    expect((h.canvas as unknown as TestCanvas).focused).toBe(true);

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

describe("backend capability contract", () => {
  // The optional members of `Renderer` are the whole capability contract. These
  // pin both halves: a backend that declares nothing degrades predictably, and
  // one that declares a capability actually has it wired through.
  test("a renderer with no optional members reports no stats", async () => {
    const h = harness();
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, () => ({ draw: () => {} }));
    await app.ready;
    expect(app.stats).toBeNull();
    app.stop();
  });

  test("asking for shader passes on a backend without a shader stage names the reason", async () => {
    const h = harness();
    let thrown: unknown;
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, () => {
      try {
        setPasses([{ fragment: "void main() { fragColor = vec4(1.0); }" }]);
      } catch (error) {
        thrown = error;
      }
      return { draw: () => {} };
    });
    await app.ready;
    expect(thrown).toBeInstanceOf(ShaderPassesUnavailableError);
    expect((thrown as Error).name).toBe("ShaderPassesUnavailableError");
    app.stop();
  });

  test("measuring text on a backend with no font names the reason", async () => {
    const h = harness();
    let thrown: unknown;
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, () => {
      try {
        measureText("hello");
      } catch (error) {
        thrown = error;
      }
      return { draw: () => {} };
    });
    await app.ready;
    expect(thrown).toBeInstanceOf(TextMeasurementUnavailableError);
    app.stop();
  });

  test("a renderer declaring measureText answers through the context", async () => {
    const h = harness();
    const measuring: Renderer = {
      ...h.renderer,
      measureText: (content, _font, size) => ({
        width: [...content].length * size,
        ascent: size,
        descent: 0,
        lineHeight: size,
      }),
    };
    let width = -1;
    const app = start({ backend: () => measuring, canvas: h.canvas }, () => {
      textSize(10);
      width = textWidth("abc");
      return { draw: () => {} };
    });
    await app.ready;
    expect(width).toBe(30);
    app.stop();
  });

  test("a renderer declaring stats has them read straight off the contract", async () => {
    const h = harness();
    const reporting: Renderer = { ...h.renderer, stats: { drawCalls: 3, instances: 42 } };
    const app = start({ backend: () => reporting, canvas: h.canvas }, () => ({ draw: () => {} }));
    await app.ready;
    expect(app.stats).toEqual({ drawCalls: 3, instances: 42 });
    app.stop();
  });

  test("a renderer declaring setPasses receives the chain and the clock", async () => {
    const h = harness();
    const installed: Array<readonly ShaderPass[]> = [];
    const times: number[] = [];
    const capable: Renderer = {
      ...h.renderer,
      setPasses: (passes): void => void installed.push(passes),
      setTime: (seconds): void => void times.push(seconds),
    };
    const pass = { fragment: "void main() { fragColor = vec4(1.0); }" };
    const app = start({ backend: () => capable, canvas: h.canvas }, () => {
      setPasses([pass]);
      return { draw: () => {} };
    });
    await app.ready;
    h.runFrame(0);
    expect(installed).toEqual([[pass]]);
    expect(times.length).toBeGreaterThan(0);
    app.stop();
  });
});

describe("overlay", () => {
  test("draws as its own stream, after the frame and outside the chain", async () => {
    const h = harness();
    const seen: string[] = [];
    const app = start(
      { backend: () => h.renderer, canvas: h.canvas },
      {
        draw: (): void => {
          seen.push("world");
          fill("white");
          circle(10, 10, 4);
        },
        overlay: (): void => {
          seen.push("overlay");
          textSize(12);
          fill("white");
        },
      },
    );

    await app.ready;
    h.runFrame(0);

    // Two streams, in that order, and only the second one opts out of the
    // chain — post-processing belongs to the world, not to the furniture.
    expect(seen).toEqual(["world", "overlay"]);
    expect(h.frames).toHaveLength(2);
    expect(h.renderOptions).toEqual([undefined, { passes: false }]);
    expect(h.frames[0]?.some((command) => command.op === "circle")).toBe(true);
    expect(h.frames[1]?.some((command) => command.op === "circle")).toBe(false);
    app.stop();
  });

  test("a scene without one renders a single stream", async () => {
    const h = harness();
    const app = start({ backend: () => h.renderer, canvas: h.canvas }, { draw: (): void => {} });
    await app.ready;
    h.runFrame(0);
    expect(h.frames).toHaveLength(1);
    expect(h.renderOptions).toEqual([undefined]);
    app.stop();
  });
});
