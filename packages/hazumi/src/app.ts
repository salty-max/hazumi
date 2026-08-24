import { AppClock, createPluginHost, type ClockOptions, type PluginBuilder } from "@hazumi/core";
import {
  type BackendFactory,
  CommandBuffer,
  type FrameStats,
  type Renderer,
  type ShaderPass,
} from "@hazumi/graphics";
import { ColorCache } from "./color-cache";
import { type ContextState, createContext, type HazumiContext } from "./context";
import { createInputTracking } from "./input-tracking";
import { PixelAccessUnavailableError, Pixels } from "./pixels";
import { enterContext, restoreContext } from "./active-context";

export {
  createPluginHost,
  definePlugin,
  DuplicatePluginError,
  DuplicateContributionError,
  ReservedContributionError,
} from "@hazumi/core";
export type {
  Plugin,
  PluginBuilder,
  PluginHost,
  PluginLifecycle,
  PluginSetupContext,
} from "@hazumi/core";

export interface AppOptions<Api extends object = Record<never, never>> {
  readonly backend: BackendFactory;
  readonly width?: number;
  readonly height?: number;
  /** Where to mount the canvas. Defaults to document.body. */
  readonly parent?: HTMLElement;
  /** Use an existing canvas instead of creating one. */
  readonly canvas?: HTMLCanvasElement;
  /**
   * Seed for `random` and `noise`. Fixed by default so an application renders
   * identically on every run; pass `Date.now()` for a different one each time.
   */
  readonly seed?: number;
  /** Device pixel ratio to render at. Defaults to the display's, capped at 2. */
  readonly pixelRatio?: number;
  /**
   * Frame-clock configuration.
   *
   * `fixedStep` and `maxFixedSteps` control scene updates;
   * `maxDelta` also clamps the variable `dt` exposed on the context.
   */
  readonly clock?: ClockOptions;
  /** Typed extensions installed into the scene context. */
  readonly plugins?: PluginBuilder<Api>;
  /**
   * Called when scene loading, update, or draw throws.
   *
   * An update or draw error stops the loop — a scene that throws does so on
   * every frame, and sixty identical stack traces a second buries the first
   * one. A replacement-scene loading error leaves the current scene active.
   * Loading errors also reject `ready` or `setScene`, so none are swallowed.
   */
  readonly onError?: (error: unknown) => void;
}

/** Advances the active scene by one fixed interval. */
export type SceneUpdate<Api extends object = Record<never, never>> = (
  fixedDt: number,
  context: HazumiContext & Api,
) => void;

/**
 * Draws the active scene once per display frame.
 *
 * `alpha` is the 0–1 progress from the latest completed update toward the next
 * one. Use it to interpolate render positions without changing simulation
 * state.
 */
export type SceneDraw<Api extends object = Record<never, never>> = (
  alpha: number,
  context: HazumiContext & Api,
) => void;

/** One independently switchable state of an application. */
export interface Scene<Api extends object = Record<never, never>> {
  readonly update?: SceneUpdate<Api>;
  readonly draw: SceneDraw<Api>;
  /**
   * Drawn after the shader chain, straight onto the canvas.
   *
   * Post-processing belongs to the world. A heads-up display that goes through
   * the same chain is dimmed by the world's lighting, warped by its warp and
   * bloomed by its bloom — a scene lit by a multiply pass finds this at once,
   * because its caption comes out at a fraction of the brightness it was drawn
   * with. Anything that belongs to the reader rather than to the world goes
   * here: a score, a control legend, a debug overlay.
   *
   * It is a second stream, so it costs a second decode. Draw the world in
   * `draw` and only the furniture here.
   *
   * A backend without a chain draws it exactly as it draws everything else, so
   * a scene written this way looks the same on all four.
   */
  readonly overlay?: SceneDraw<Api>;
  /** Release resources owned by this scene before it is replaced or stopped. */
  readonly dispose?: (context: HazumiContext & Api) => void;
}

/**
 * Builds a scene, optionally loading assets before it becomes active.
 *
 * Scene-scoped imports are active for the whole factory, including code after
 * an `await`. Plugin services such as `audio` still live on the supplied
 * context argument. The returned lifecycle callbacks can use the imports too.
 */
export type SceneFactory<Api extends object = Record<never, never>> = (
  context: HazumiContext & Api,
) => Scene<Api> | Promise<Scene<Api>>;

/** A ready scene or a factory that creates one. */
export type SceneSource<Api extends object = Record<never, never>> = Scene<Api> | SceneFactory<Api>;

// Part of Hazumi's public surface, but owned by the backend contract at L3 so
// that backends and the runtime cannot disagree about their shape.
export type { FrameStats, ShaderPass } from "@hazumi/graphics";

/** Thrown when a scene measures text on a backend with no font context. */
export class TextMeasurementUnavailableError extends Error {
  constructor(
    message: string = "This backend cannot measure text. The headless recorder has no " +
      "font to measure against; render through WebGL2, Canvas2D or SVG to lay text out.",
  ) {
    super(message);
    this.name = "TextMeasurementUnavailableError";
  }
}

/** Thrown when a scene asks for shader passes on a backend without a shader stage. */
export class ShaderPassesUnavailableError extends Error {
  constructor(
    message: string = "This backend cannot run shader passes. Only the WebGL2 backend " +
      "has a shader stage; Canvas2D and SVG do not.",
  ) {
    super(message);
    this.name = "ShaderPassesUnavailableError";
  }
}

/**
 * The capability sub-contracts, derived from `Renderer` instead of restated.
 *
 * `Required<Pick<...>>` is what keeps these honest: they cannot drift from the
 * interface they narrow, and dropping a capability from the contract breaks
 * here at compile time rather than silently disabling a feature at runtime.
 * These were once hand-written interfaces listing members `Renderer` did not
 * declare at all, which made the capability contract invisible to anyone
 * writing a backend.
 */
type PostCapableRenderer = Renderer & Required<Pick<Renderer, "setPasses" | "setTime">>;
type StatsCapableRenderer = Renderer & Required<Pick<Renderer, "stats">>;
type PixelCapableRenderer = Renderer & Required<Pick<Renderer, "readPixels" | "writePixels">>;
type MeasureCapableRenderer = Renderer & Required<Pick<Renderer, "measureText">>;

function reportsStats(renderer: Renderer): renderer is StatsCapableRenderer {
  return renderer.stats !== undefined;
}

function supportsPasses(renderer: Renderer): renderer is PostCapableRenderer {
  return typeof renderer.setPasses === "function" && typeof renderer.setTime === "function";
}

function measuresText(renderer: Renderer): renderer is MeasureCapableRenderer {
  return typeof renderer.measureText === "function";
}

function supportsPixels(renderer: Renderer): renderer is PixelCapableRenderer {
  return typeof renderer.readPixels === "function" && typeof renderer.writePixels === "function";
}

export interface HazumiApp<Api extends object = Record<never, never>> {
  readonly context: HazumiContext & Api;
  readonly canvas: HTMLCanvasElement;
  /** Resolves once the initial scene has finished loading. */
  readonly ready: Promise<void>;
  /** The active scene, or null while the initial scene is loading. */
  readonly scene: Scene<Api> | null;
  /**
   * What the last frame cost, or null on a backend that does not track it.
   *
   * Draw calls are the number worth watching: batching merges only adjacent
   * instances, so drawing from several spritesheets in an interleaved order
   * costs one call per sprite, while grouping by sheet costs one per sheet.
   */
  readonly stats: FrameStats | null;
  /**
   * Replace the post-processing chain.
   *
   * Throws on a backend that cannot run passes — Canvas2D and SVG have no
   * shader stage, and silently ignoring the request would leave a scene
   * looking wrong with nothing to explain why.
   */
  setPasses: (passes: readonly ShaderPass[]) => void;
  /** Load and activate a scene, disposing the previous one after it is ready. */
  setScene: (scene: SceneSource<Api>) => Promise<void>;
  /** Resize the logical canvas and its device-pixel backing store. */
  resize: (width: number, height: number, pixelRatio?: number) => void;
  /** Copy the current physical canvas pixels into a mutable top-down RGBA surface. */
  loadPixels: () => Pixels;
  /** Replace the current canvas with a pixel surface returned by loadPixels(). */
  updatePixels: (pixels: Pixels) => void;
  /** Encode the current frame as a PNG at physical canvas resolution. */
  capturePng: () => Promise<Blob>;
  /** Draw exactly one frame. Useful when the loop is stopped. No-op after stop(). */
  redraw: () => void;
  /**
   * Stop the loop and release everything the application acquired: the frame
   * request, the input listeners, the backend, and the canvas itself if the
   * application created it.
   */
  stop: () => void;
  /** True once stop() has run. */
  readonly stopped: boolean;
}

const MAX_PIXEL_RATIO = 2;

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

function displayPixelRatio(): number {
  return Math.min(positiveFinite(globalThis.devicePixelRatio ?? 1, "pixelRatio"), MAX_PIXEL_RATIO);
}

/** Keys the browser uses to scroll the page. A sketch that reads them has to swallow the default. */

/**
 * Start a Hazumi application with its initial scene.
 *
 * ```ts
 * import { start } from 'hazumi/app';
 * import { webgl2 } from 'hazumi/backends/webgl2';
 * import { background, circle, fill, oklch } from 'hazumi/draw';
 * import { camera } from 'hazumi/scene';
 *
 * start({ backend: webgl2(), width: 600, height: 600 }, () => {
 *   const player = { x: 300, y: 300 };
 *
 *   return {
 *     update(dt) {
 *       player.x += 40 * dt;
 *       camera.follow(player.x, player.y, 0.12);
 *     },
 *     draw() {
 *       background(oklch(0.12, 0.02, 260));
 *       fill(oklch(0.74, 0.18, 160));
 *       circle(player.x, player.y, 48);
 *     },
 *   };
 * });
 * ```
 */
export function start<Api extends object = Record<never, never>>(
  options: AppOptions<Api>,
  initialScene: SceneSource<Api>,
): HazumiApp<Api> {
  const width = positiveFinite(options.width ?? 600, "width");
  const height = positiveFinite(options.height ?? 600, "height");
  // Validate timing before acquiring a renderer or attaching a canvas. Invalid
  // configuration must not leak resources while construction unwinds.
  const clock = new AppClock(options.clock);

  const canvas = options.canvas ?? document.createElement("canvas");
  const ownsCanvas = options.canvas === undefined;
  let ratio = Math.min(
    positiveFinite(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, "pixelRatio"),
    MAX_PIXEL_RATIO,
  );

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  // Keep the logical aspect ratio when a narrow parent constrains the canvas.
  // A fixed inline height would stretch the bitmap as only its width shrinks.
  canvas.style.maxWidth = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${width} / ${height}`;
  // The canvas owns gestures that begin on it. Without this, a touch drag may
  // scroll or zoom the page instead of producing a stable pointer stream.
  canvas.style.touchAction = "none";
  canvas.style.userSelect = "none";
  // Focusable so arrow keys go to the sketch after a click, not the page.
  canvas.tabIndex = 0;

  if (ownsCanvas) {
    (options.parent ?? document.body).append(canvas);
  }

  const renderer = options.backend(canvas);
  // The viewport stays in logical coordinates. Each backend maps it onto the
  // physical backing store, so a scene does not need to know its display DPR.
  renderer.setViewport(width, height);

  const buffer = new CommandBuffer();
  const colors = new ColorCache();

  const state: ContextState = {
    width,
    height,
    pixelRatio: ratio,
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

  const applyPasses = (passes: readonly ShaderPass[]): void => {
    if (!supportsPasses(renderer)) throw new ShaderPassesUnavailableError();
    renderer.setPasses(passes);
  };

  const {
    context,
    beginFrame,
    endFrame,
    resize: resizeContext,
  } = createContext({
    buffer,
    colors,
    state,
    seed: options.seed ?? 1,
    setPasses: applyPasses,
    // Derived from what the backend implements, once, rather than sniffed at
    // every call site. A backend cannot lie about this: it is the same test the
    // runtime already used to decide whether to throw.
    capabilities: {
      shaders: supportsPasses(renderer),
      pixels: supportsPixels(renderer),
      text: measuresText(renderer),
    },
    measureText: (content, font, size) => {
      if (!measuresText(renderer)) throw new TextMeasurementUnavailableError();
      return renderer.measureText(content, font, size);
    },
  });
  const pluginHost = (() => {
    try {
      return options.plugins === undefined ? createPluginHost().build() : options.plugins.build();
    } catch (error) {
      try {
        renderer.dispose();
      } finally {
        if (ownsCanvas) canvas.remove();
      }
      throw error;
    }
  })();
  for (const key of Object.keys(pluginHost.extensions)) {
    if (key in context) {
      try {
        pluginHost.dispose();
      } finally {
        try {
          renderer.dispose();
        } finally {
          if (ownsCanvas) canvas.remove();
        }
      }
      throw new TypeError(
        `Plugin contribution ${JSON.stringify(key)} conflicts with HazumiContext`,
      );
    }
  }
  const sceneContext = Object.assign(context, pluginHost.extensions) as HazumiContext & Api;

  let activeScene: Scene<Api> | null = null;
  let sceneRevision = 0;
  let frameHandle = 0;
  let stopped = false;
  const resize = (nextWidth: number, nextHeight: number, pixelRatio = ratio): void => {
    if (stopped) return;
    const logicalWidth = positiveFinite(nextWidth, "width");
    const logicalHeight = positiveFinite(nextHeight, "height");
    const nextRatio = Math.min(positiveFinite(pixelRatio, "pixelRatio"), MAX_PIXEL_RATIO);

    canvas.width = Math.round(logicalWidth * nextRatio);
    canvas.height = Math.round(logicalHeight * nextRatio);
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.aspectRatio = `${logicalWidth} / ${logicalHeight}`;
    state.width = logicalWidth;
    state.height = logicalHeight;
    state.pixelRatio = nextRatio;
    ratio = nextRatio;
    resizeContext(logicalWidth, logicalHeight);
    renderer.setViewport(logicalWidth, logicalHeight);
    if (!state.looping && activeScene !== null) renderFrame(performance.now());
  };
  const onDisplayResize = (): void => {
    const nextRatio = displayPixelRatio();
    if (nextRatio !== ratio) resize(state.width, state.height, nextRatio);
  };
  const tracking = createInputTracking(state, canvas);
  tracking.attach();
  if (options.pixelRatio === undefined) globalThis.addEventListener("resize", onDisplayResize);
  // Stable callback: stepFixed may call it several times per frame, so do not
  // allocate a closure in the per-frame path.
  const runSceneUpdate = (fixedDt: number): void => {
    if (stopped) return;
    tracking.beginStep();
    const previousContext = enterContext(sceneContext);
    try {
      pluginHost.preupdate(fixedDt);
      if (stopped) return;
      activeScene?.update?.(fixedDt, sceneContext);
      if (stopped) return;
      pluginHost.postupdate(fixedDt);
    } finally {
      restoreContext(previousContext);
      tracking.endStep();
    }
  };

  const renderFrame = (nowMs: number): void => {
    if (stopped) return;
    clock.advance(nowMs / 1000);
    state.frameCount = clock.frame;
    state.t = clock.elapsed;
    state.dt = clock.dt;

    try {
      // Updates run before the buffer is cleared. Drawing from update is not
      // part of the contract and therefore cannot leak into the render frame.
      // Always drain the accumulator. Otherwise a scene without update() would
      // hand all its elapsed time to the next scene that has one.
      clock.stepFixed(runSceneUpdate);
      if (stopped) return;

      buffer.reset();
      // The buffer is a fresh stream each frame, so the current style has to be
      // re-emitted into it before anything is drawn.
      beginFrame();

      const previousContext = enterContext(sceneContext);
      try {
        pluginHost.predraw(state.dt);
        if (!stopped) activeScene?.draw(clock.alpha(), sceneContext);
        if (!stopped) pluginHost.postdraw(state.dt);
      } finally {
        restoreContext(previousContext);
      }
      if (stopped) return;
      // Settle depth ordering before the renderer walks the stream: batching
      // merges adjacent commands, so the order has to be final by now.
      endFrame();
      if (supportsPasses(renderer)) renderer.setTime(state.t);
      renderer.render(buffer);

      const overlay = activeScene?.overlay;
      if (overlay !== undefined) {
        // A second stream, drawn straight to the canvas over what the chain
        // just presented. It does not clear, because nothing in it calls
        // background() — and if something did, it would be asking to paint over
        // the frame, which is its right.
        buffer.reset();
        beginFrame();
        const previousOverlay = enterContext(sceneContext);
        try {
          if (!stopped) overlay(clock.alpha(), sceneContext);
        } finally {
          restoreContext(previousOverlay);
        }
        endFrame();
        if (!stopped) renderer.render(buffer, { passes: false });
      }
    } catch (error) {
      // Stop before reporting: a throwing scene throws every frame, and the
      // loop would otherwise bury the first error under sixty a second.
      state.looping = false;
      if (options.onError === undefined) throw error;
      options.onError(error);
    } finally {
      // Updated after the frame, not on the move event: a scene reads
      // pmouse to get the delta since it last drew, and the cursor can move
      // several times between frames.
      state.pmouseX = state.mouseX;
      state.pmouseY = state.mouseY;
    }
  };

  const tick = (nowMs: number): void => {
    if (stopped) return;
    if (state.looping) renderFrame(nowMs);
    frameHandle = requestAnimationFrame(tick);
  };

  const disposeRuntime = (): void => {
    if (stopped) return;
    stopped = true;
    state.looping = false;
    sceneRevision++;
    cancelAnimationFrame(frameHandle);
    tracking.detach();
    if (options.pixelRatio === undefined) globalThis.removeEventListener("resize", onDisplayResize);
    const previousContext = enterContext(sceneContext);
    try {
      activeScene?.dispose?.(sceneContext);
    } finally {
      restoreContext(previousContext);
      activeScene = null;
      try {
        pluginHost.dispose();
      } finally {
        try {
          renderer.dispose();
        } finally {
          // An application that created its canvas has to take it away again, or
          // repeatedly starting and stopping one leaves orphaned canvases behind.
          if (ownsCanvas) canvas.remove();
        }
      }
    }
  };

  const loadScene = async (source: SceneSource<Api>): Promise<void> => {
    const revision = ++sceneRevision;
    if (stopped) return;

    let next: Scene<Api>;
    try {
      if (typeof source === "function") {
        const previousContext = enterContext(sceneContext);
        try {
          next = await Promise.resolve(source(sceneContext));
        } finally {
          restoreContext(previousContext);
        }
      } else {
        next = source;
      }
    } catch (error) {
      // A superseded load no longer controls application state. Its failure is
      // therefore no more relevant than its eventual successful result would
      // have been, and must not tear down a newer active scene.
      if (stopped || revision !== sceneRevision) return;
      throw error;
    }
    if (next === null || typeof next !== "object" || typeof next.draw !== "function") {
      throw new TypeError("A scene must be an object with a draw() function");
    }
    if (stopped || revision !== sceneRevision) {
      const previousContext = enterContext(sceneContext);
      try {
        next.dispose?.(sceneContext);
      } finally {
        restoreContext(previousContext);
      }
      return;
    }

    const previous = activeScene;
    activeScene = next;
    const previousContext = enterContext(sceneContext);
    try {
      previous?.dispose?.(sceneContext);
    } finally {
      restoreContext(previousContext);
    }
    if (!state.looping) renderFrame(performance.now());
  };

  const ready = pluginHost
    .presetup()
    .then(() => loadScene(initialScene))
    .then(() => {
      if (stopped) return;
      return pluginHost.postsetup();
    })
    .then(() => {
      if (!stopped) frameHandle = requestAnimationFrame(tick);
    })
    .catch((error: unknown) => {
      disposeRuntime();
      options.onError?.(error);
      throw error;
    });

  const setScene = async (scene: SceneSource<Api>): Promise<void> => {
    try {
      await loadScene(scene);
    } catch (error) {
      options.onError?.(error);
      throw error;
    }
  };

  const rasterRenderer = (): PixelCapableRenderer => {
    if (stopped) {
      throw new PixelAccessUnavailableError("Pixel access is unavailable after app.stop()");
    }
    if (!supportsPixels(renderer)) throw new PixelAccessUnavailableError();
    return renderer;
  };
  const loadPixels = (): Pixels => {
    const snapshot = rasterRenderer().readPixels();
    return new Pixels(snapshot.width, snapshot.height, state.pixelRatio, snapshot.data);
  };
  const updatePixels = (pixels: Pixels): void => {
    const raster = rasterRenderer();
    if (pixels.width !== canvas.width || pixels.height !== canvas.height) {
      throw new RangeError(
        `Pixel surface is ${pixels.width}x${pixels.height}; expected ` +
          `${canvas.width}x${canvas.height}`,
      );
    }
    raster.writePixels(pixels);
  };
  const capturePng = async (): Promise<Blob> => {
    const pixels = loadPixels();
    const output = document.createElement("canvas");
    output.width = pixels.width;
    output.height = pixels.height;
    const outputContext = output.getContext("2d");
    if (outputContext === null) throw new Error("Canvas2D is required to encode a PNG");
    const image = outputContext.createImageData(pixels.width, pixels.height);
    image.data.set(pixels.data);
    outputContext.putImageData(image, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      output.toBlob((blob) => {
        if (blob === null) reject(new Error("The browser could not encode the canvas as PNG"));
        else resolve(blob);
      }, "image/png");
    });
  };

  return {
    context: sceneContext,
    canvas,
    ready,
    get scene(): Scene<Api> | null {
      return activeScene;
    },
    get stats(): FrameStats | null {
      return reportsStats(renderer) ? renderer.stats : null;
    },
    setPasses: applyPasses,
    setScene,
    resize,
    loadPixels,
    updatePixels,
    capturePng,
    get stopped(): boolean {
      return stopped;
    },
    redraw: (): void => {
      // Drawing through a disposed renderer is at best a silent no-op and at
      // worst a use-after-free, so refuse rather than half-work.
      if (stopped || activeScene === null) return;
      renderFrame(performance.now());
    },
    stop: disposeRuntime,
  };
}
