import { AppClock, type ClockOptions } from "@matter/core";
import { type BackendFactory, CommandBuffer, type Renderer } from "@matter/graphics";
import { ColorCache } from "./color-cache";
import { type ContextState, createContext, type MatterContext } from "./context";

export interface AppOptions {
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
export type SceneUpdate = (fixedDt: number, context: MatterContext) => void;

/**
 * Draws the active scene once per display frame.
 *
 * `alpha` is the 0–1 progress from the latest completed update toward the next
 * one. Use it to interpolate render positions without changing simulation
 * state.
 */
export type SceneDraw = (alpha: number, context: MatterContext) => void;

/** One independently switchable state of an application. */
export interface Scene {
  readonly update?: SceneUpdate;
  readonly draw: SceneDraw;
  /** Release resources owned by this scene before it is replaced or stopped. */
  readonly dispose?: (context: MatterContext) => void;
}

/** Builds a scene, optionally loading assets before it becomes active. */
export type SceneFactory = (context: MatterContext) => Scene | Promise<Scene>;

/** A ready scene or a factory that creates one. */
export type SceneSource = Scene | SceneFactory;

/**
 * A post-processing pass.
 *
 * `fragment` is only a `main()`. The runtime supplies `v_uv`, `fragColor`,
 * `u_texture` (the previous pass, or the scene), `u_resolution`, `u_time` and
 * a `texelSize()` helper, so the smallest useful effect is three lines.
 */
export interface ShaderPass {
  readonly fragment: string;
  readonly uniforms?: Readonly<Record<string, number | readonly number[]>>;
}

/** What the last frame cost, where the backend can report it. */
export interface FrameStats {
  readonly drawCalls: number;
  /** Instances across every instanced pipeline — shapes, glyphs and images. */
  readonly instances: number;
}

/** A renderer that can run a post-processing chain. */
interface PostCapableRenderer extends Renderer {
  setPasses: (passes: readonly ShaderPass[]) => void;
  setTime: (seconds: number) => void;
}

interface StatsCapableRenderer extends Renderer {
  readonly stats: FrameStats;
}

function reportsStats(renderer: Renderer): renderer is StatsCapableRenderer {
  return "stats" in renderer;
}

function supportsPasses(renderer: Renderer): renderer is PostCapableRenderer {
  return (
    typeof (renderer as PostCapableRenderer).setPasses === "function" &&
    typeof (renderer as PostCapableRenderer).setTime === "function"
  );
}

export interface MatterApp {
  readonly context: MatterContext;
  readonly canvas: HTMLCanvasElement;
  /** Resolves once the initial scene has finished loading. */
  readonly ready: Promise<void>;
  /** The active scene, or null while the initial scene is loading. */
  readonly scene: Scene | null;
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
  setScene: (scene: SceneSource) => Promise<void>;
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

/**
 * Start a Matter application with its initial scene.
 *
 * ```ts
 * start({ backend: webgl2(), width: 600, height: 600 }, () => {
 *   const player = { x: 300, y: 300 };
 *
 *   return {
 *     update(dt, { camera }) {
 *       player.x += 40 * dt;
 *       camera.follow(player.x, player.y, 0.12);
 *     },
 *     draw(_alpha, { background, circle, fill }) {
 *       background('#090d16');
 *       fill('oklch(.74 .18 160)');
 *       circle(player.x, player.y, 48);
 *     },
 *   };
 * });
 * ```
 */
export function start(options: AppOptions, initialScene: SceneSource): MatterApp {
  const width = options.width ?? 600;
  const height = options.height ?? 600;
  // Validate timing before acquiring a renderer or attaching a canvas. Invalid
  // configuration must not leak resources while construction unwinds.
  const clock = new AppClock(options.clock);

  const canvas = options.canvas ?? document.createElement("canvas");
  const ownsCanvas = options.canvas === undefined;
  const ratio = Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, MAX_PIXEL_RATIO);

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  // Keep the logical aspect ratio when a narrow parent constrains the canvas.
  // A fixed inline height would stretch the bitmap as only its width shrinks.
  canvas.style.maxWidth = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${width} / ${height}`;

  if (ownsCanvas) {
    (options.parent ?? document.body).append(canvas);
  }

  const renderer = options.backend(canvas);
  // The viewport is in device pixels; scene coordinates stay in CSS pixels,
  // so a scene does not have to know what display it landed on.
  renderer.setViewport(width, height);

  const buffer = new CommandBuffer();
  const colors = new ColorCache();

  const state: ContextState = {
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
    looping: true,
  };

  const applyPasses = (passes: readonly ShaderPass[]): void => {
    if (!supportsPasses(renderer)) {
      throw new Error(
        "This backend cannot run shader passes. Only the WebGL2 backend has a " +
          "shader stage; Canvas2D and SVG do not.",
      );
    }
    renderer.setPasses(passes);
  };

  const { context, beginFrame } = createContext({
    buffer,
    colors,
    state,
    seed: options.seed ?? 1,
    setPasses: applyPasses,
  });

  const onMove = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : state.width / rect.width;
    const scaleY = rect.height === 0 ? 1 : state.height / rect.height;
    state.mouseX = (event.clientX - rect.left) * scaleX;
    state.mouseY = (event.clientY - rect.top) * scaleY;
  };
  const onDown = (event: MouseEvent): void => {
    state.mouseIsPressed = true;
    state.mouseButton = event.button;
  };
  const onUp = (): void => {
    state.mouseIsPressed = false;
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    state.keyIsPressed = true;
    state.key = event.key;
    state.keysDown.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    state.keysDown.delete(event.key);
    state.keyIsPressed = state.keysDown.size > 0;
  };
  const onBlur = (): void => {
    // A key released while the window is unfocused never fires keyup, so it
    // would stay held forever. Clearing on blur is the only way to notice.
    state.keysDown.clear();
    state.keyIsPressed = false;
    state.mouseIsPressed = false;
  };

  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mousedown", onDown);
  globalThis.addEventListener("mouseup", onUp);
  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);
  globalThis.addEventListener("blur", onBlur);

  let activeScene: Scene | null = null;
  let sceneRevision = 0;
  let frameHandle = 0;
  let stopped = false;
  // Stable callback: stepFixed may call it several times per frame, so do not
  // allocate a closure in the per-frame path.
  const runSceneUpdate = (fixedDt: number): void => {
    activeScene?.update?.(fixedDt, context);
  };

  const renderFrame = (nowMs: number): void => {
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

      buffer.reset();
      // The buffer is a fresh stream each frame, so the current style has to be
      // re-emitted into it before anything is drawn.
      beginFrame();

      activeScene?.draw(clock.alpha(), context);
      if (supportsPasses(renderer)) renderer.setTime(state.t);
      renderer.render(buffer);
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
    sceneRevision++;
    cancelAnimationFrame(frameHandle);
    canvas.removeEventListener("mousemove", onMove);
    canvas.removeEventListener("mousedown", onDown);
    globalThis.removeEventListener("mouseup", onUp);
    globalThis.removeEventListener("keydown", onKeyDown);
    globalThis.removeEventListener("keyup", onKeyUp);
    globalThis.removeEventListener("blur", onBlur);
    try {
      activeScene?.dispose?.(context);
    } finally {
      activeScene = null;
      try {
        renderer.dispose();
      } finally {
        // An application that created its canvas has to take it away again, or
        // repeatedly starting and stopping one leaves orphaned canvases behind.
        if (ownsCanvas) canvas.remove();
      }
    }
  };

  const loadScene = async (source: SceneSource): Promise<void> => {
    const revision = ++sceneRevision;
    if (stopped) return;

    let next: Scene;
    try {
      next = typeof source === "function" ? await source(context) : source;
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
      next.dispose?.(context);
      return;
    }

    const previous = activeScene;
    activeScene = next;
    previous?.dispose?.(context);
    if (!state.looping) renderFrame(performance.now());
  };

  const ready = loadScene(initialScene)
    .then(() => {
      if (!stopped) frameHandle = requestAnimationFrame(tick);
    })
    .catch((error: unknown) => {
      disposeRuntime();
      options.onError?.(error);
      throw error;
    });

  const setScene = async (scene: SceneSource): Promise<void> => {
    try {
      await loadScene(scene);
    } catch (error) {
      options.onError?.(error);
      throw error;
    }
  };

  return {
    context,
    canvas,
    ready,
    get scene(): Scene | null {
      return activeScene;
    },
    get stats(): FrameStats | null {
      return reportsStats(renderer) ? renderer.stats : null;
    },
    setPasses: applyPasses,
    setScene,
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
