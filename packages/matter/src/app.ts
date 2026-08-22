import { AppClock, createPluginHost, type ClockOptions, type PluginBuilder } from "@matter/core";
import {
  type BackendFactory,
  CommandBuffer,
  type PixelData,
  type Renderer,
} from "@matter/graphics";
import { ColorCache } from "./color-cache";
import {
  type ContextState,
  createContext,
  type GamepadButtonInput,
  type GamepadInput,
  type MatterContext,
  type PointerInput,
} from "./context";
import { PixelAccessUnavailableError, Pixels } from "./pixels";
import { enterContext, restoreContext } from "./active-context";

export {
  createPluginHost,
  definePlugin,
  DuplicatePluginError,
  DuplicateContributionError,
  ReservedContributionError,
} from "@matter/core";
export type {
  Plugin,
  PluginBuilder,
  PluginHost,
  PluginLifecycle,
  PluginSetupContext,
} from "@matter/core";

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
  context: MatterContext & Api,
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
  context: MatterContext & Api,
) => void;

/** One independently switchable state of an application. */
export interface Scene<Api extends object = Record<never, never>> {
  readonly update?: SceneUpdate<Api>;
  readonly draw: SceneDraw<Api>;
  /** Release resources owned by this scene before it is replaced or stopped. */
  readonly dispose?: (context: MatterContext & Api) => void;
}

/**
 * Builds a scene, optionally loading assets before it becomes active.
 *
 * Scene-scoped imports are active during synchronous setup. After an `await`,
 * use the supplied context for app-owned services or values needed to finish
 * setup; the returned lifecycle callbacks can use capability imports again.
 */
export type SceneFactory<Api extends object = Record<never, never>> = (
  context: MatterContext & Api,
) => Scene<Api> | Promise<Scene<Api>>;

/** A ready scene or a factory that creates one. */
export type SceneSource<Api extends object = Record<never, never>> = Scene<Api> | SceneFactory<Api>;

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

interface PixelCapableRenderer extends Renderer {
  readPixels: () => PixelData;
  writePixels: (pixels: PixelData) => void;
}

interface MutablePointerInput extends PointerInput {
  id: number;
  type: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  pressure: number;
  isPrimary: boolean;
  isPressed: boolean;
}

interface MutableGamepadButtonInput extends GamepadButtonInput {
  value: number;
  pressed: boolean;
  touched: boolean;
}

interface MutableGamepadInput extends GamepadInput {
  id: string;
  mapping: string;
  connected: boolean;
  axes: number[];
  buttons: MutableGamepadButtonInput[];
  seen: boolean;
}

function addGamepadEdge(edges: Map<number, Set<number>>, index: number, button: number): void {
  let buttons = edges.get(index);
  if (buttons === undefined) {
    buttons = new Set<number>();
    edges.set(index, buttons);
  }
  buttons.add(button);
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

function supportsPixels(renderer: Renderer): renderer is PixelCapableRenderer {
  return (
    typeof (renderer as PixelCapableRenderer).readPixels === "function" &&
    typeof (renderer as PixelCapableRenderer).writePixels === "function"
  );
}

export interface MatterApp<Api extends object = Record<never, never>> {
  readonly context: MatterContext & Api;
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

/**
 * Start a Matter application with its initial scene.
 *
 * ```ts
 * import { start } from 'matter/app';
 * import { webgl2 } from 'matter/backends/webgl2';
 * import { background, circle, fill, oklch } from 'matter/draw';
 * import { camera } from 'matter/scene';
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
): MatterApp<Api> {
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

  let pendingKeysPressed = new Set<string>();
  let pendingKeysReleased = new Set<string>();
  let pendingMouseButtonsPressed = new Set<number>();
  let pendingMouseButtonsReleased = new Set<number>();
  let pendingPointersPressed = new Set<number>();
  let pendingPointersReleased = new Set<number>();
  let pendingWheelX = 0;
  let pendingWheelY = 0;
  const mouseButtonsDown = new Set<number>();
  const pointersById = new Map<number, MutablePointerInput>();
  const gamepadsByIndex = new Map<number, MutableGamepadInput>();
  const getGamepads = globalThis.navigator?.getGamepads?.bind(globalThis.navigator);

  const clearGamepadEdges = (edges: Map<number, Set<number>>): void => {
    for (let index = 0; index < state.gamepads.length; index++) {
      edges.get(state.gamepads[index]!.index)?.clear();
    }
  };
  const pollGamepads = (): void => {
    if (getGamepads === undefined) return;
    for (let index = 0; index < state.gamepads.length; index++) {
      (state.gamepads[index] as MutableGamepadInput).seen = false;
    }

    const nativeGamepads = getGamepads();
    for (let nativeIndex = 0; nativeIndex < nativeGamepads.length; nativeIndex++) {
      const native = nativeGamepads[nativeIndex];
      if (native === undefined || native === null || !native.connected) continue;

      let input = gamepadsByIndex.get(native.index);
      if (input === undefined) {
        input = {
          index: native.index,
          id: native.id,
          mapping: native.mapping,
          connected: true,
          axes: [],
          buttons: [],
          seen: true,
        };
        gamepadsByIndex.set(native.index, input);
        let insertion = state.gamepads.length;
        while (insertion > 0 && state.gamepads[insertion - 1]!.index > native.index) insertion--;
        state.gamepads.splice(insertion, 0, input);
      }

      input.seen = true;
      input.connected = true;
      input.id = native.id;
      input.mapping = native.mapping;
      input.axes.length = native.axes.length;
      for (let axis = 0; axis < native.axes.length; axis++) input.axes[axis] = native.axes[axis]!;

      for (let button = 0; button < native.buttons.length; button++) {
        const source = native.buttons[button]!;
        let target = input.buttons[button];
        if (target === undefined) {
          target = { value: 0, pressed: false, touched: false };
          input.buttons[button] = target;
        }
        if (source.pressed !== target.pressed) {
          addGamepadEdge(
            source.pressed ? state.gamepadButtonsPressed : state.gamepadButtonsReleased,
            native.index,
            button,
          );
        }
        target.value = source.value;
        target.pressed = source.pressed;
        target.touched = source.touched;
      }
      for (let button = native.buttons.length; button < input.buttons.length; button++) {
        if (input.buttons[button]!.pressed) {
          addGamepadEdge(state.gamepadButtonsReleased, native.index, button);
        }
      }
      input.buttons.length = native.buttons.length;
    }

    for (let index = 0; index < state.gamepads.length; index++) {
      const input = state.gamepads[index] as MutableGamepadInput;
      if (input.seen || !input.connected) continue;
      input.connected = false;
      for (let button = 0; button < input.buttons.length; button++) {
        const target = input.buttons[button]!;
        if (target.pressed) addGamepadEdge(state.gamepadButtonsReleased, input.index, button);
        target.value = 0;
        target.pressed = false;
        target.touched = false;
      }
    }
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

  const {
    context,
    beginFrame,
    resize: resizeContext,
  } = createContext({
    buffer,
    colors,
    state,
    seed: options.seed ?? 1,
    setPasses: applyPasses,
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
        `Plugin contribution ${JSON.stringify(key)} conflicts with MatterContext`,
      );
    }
  }
  const sceneContext = Object.assign(context, pluginHost.extensions) as MatterContext & Api;

  const pointerPosition = (event: PointerEvent): readonly [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : state.width / rect.width;
    const scaleY = rect.height === 0 ? 1 : state.height / rect.height;
    return [(event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY];
  };
  const updatePointer = (event: PointerEvent): MutablePointerInput => {
    const [x, y] = pointerPosition(event);
    let pointer = pointersById.get(event.pointerId);
    if (pointer === undefined) {
      pointer = {
        id: event.pointerId,
        type: event.pointerType || "mouse",
        x,
        y,
        previousX: x,
        previousY: y,
        pressure: event.pressure,
        isPrimary: event.isPrimary,
        isPressed: false,
      };
      pointersById.set(event.pointerId, pointer);
      state.pointers.push(pointer);
    } else {
      pointer.type = event.pointerType || pointer.type;
      pointer.x = x;
      pointer.y = y;
      pointer.pressure = event.pressure;
      pointer.isPrimary = event.isPrimary;
    }
    if (event.isPrimary) {
      state.mouseX = x;
      state.mouseY = y;
    }
    return pointer;
  };
  const onPointerMove = (event: PointerEvent): void => {
    updatePointer(event);
  };
  const onPointerLeave = (event: PointerEvent): void => {
    const pointer = pointersById.get(event.pointerId);
    if (
      pointer === undefined ||
      pointer.isPressed ||
      pendingPointersReleased.has(event.pointerId) ||
      state.pointersReleased.has(event.pointerId)
    ) {
      return;
    }
    pointersById.delete(event.pointerId);
    const index = state.pointers.indexOf(pointer);
    if (index !== -1) state.pointers.splice(index, 1);
  };
  const onPointerDown = (event: PointerEvent): void => {
    const pointer = updatePointer(event);
    if (!pointer.isPressed) pendingPointersPressed.add(event.pointerId);
    pointer.isPressed = true;
    if (event.isPrimary) {
      if (!mouseButtonsDown.has(event.button)) pendingMouseButtonsPressed.add(event.button);
      mouseButtonsDown.add(event.button);
      state.mouseIsPressed = true;
      state.mouseButton = event.button;
    }
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerEnd = (event: PointerEvent): void => {
    // Pointer-up is global so a drag can finish outside the canvas, but events
    // that began on another element do not belong to this application.
    if (!pointersById.has(event.pointerId)) return;
    const pointer = updatePointer(event);
    const cancelled = event.type === "pointercancel";
    const stillPressed = !cancelled && event.buttons !== 0;
    if (pointer.isPressed && !stillPressed) pendingPointersReleased.add(event.pointerId);
    pointer.isPressed = stillPressed;
    if (!stillPressed) pointer.pressure = 0;
    if (event.isPrimary) {
      if (cancelled) {
        for (const button of mouseButtonsDown) pendingMouseButtonsReleased.add(button);
        mouseButtonsDown.clear();
      } else if (mouseButtonsDown.delete(event.button)) {
        pendingMouseButtonsReleased.add(event.button);
      }
      state.mouseIsPressed = mouseButtonsDown.size > 0;
    }
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: WheelEvent): void => {
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.height : 1;
    pendingWheelX += event.deltaX * scale;
    pendingWheelY += event.deltaY * scale;
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!state.keysDown.has(event.key)) pendingKeysPressed.add(event.key);
    state.keyIsPressed = true;
    state.key = event.key;
    state.keysDown.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (state.keysDown.delete(event.key)) pendingKeysReleased.add(event.key);
    state.keyIsPressed = state.keysDown.size > 0;
  };
  const onBlur = (): void => {
    // A key released while the window is unfocused never fires keyup, so it
    // would stay held forever. Clearing on blur is the only way to notice.
    for (const key of state.keysDown) pendingKeysReleased.add(key);
    state.keysDown.clear();
    state.keyIsPressed = false;
    for (const button of mouseButtonsDown) pendingMouseButtonsReleased.add(button);
    mouseButtonsDown.clear();
    state.mouseIsPressed = false;
    for (const pointer of state.pointers) {
      if (!pointer.isPressed) continue;
      pendingPointersReleased.add(pointer.id);
      const mutable = pointer as MutablePointerInput;
      mutable.isPressed = false;
      mutable.pressure = 0;
    }
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("wheel", onWheel);
  globalThis.addEventListener("pointerup", onPointerEnd);
  globalThis.addEventListener("pointercancel", onPointerEnd);
  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);
  globalThis.addEventListener("blur", onBlur);

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
  if (options.pixelRatio === undefined) globalThis.addEventListener("resize", onDisplayResize);
  const beginInputStep = (): void => {
    let previous = state.keysPressed;
    state.keysPressed = pendingKeysPressed;
    pendingKeysPressed = previous;

    previous = state.keysReleased;
    state.keysReleased = pendingKeysReleased;
    pendingKeysReleased = previous;

    let previousButtons = state.mouseButtonsPressed;
    state.mouseButtonsPressed = pendingMouseButtonsPressed;
    pendingMouseButtonsPressed = previousButtons;

    previousButtons = state.mouseButtonsReleased;
    state.mouseButtonsReleased = pendingMouseButtonsReleased;
    pendingMouseButtonsReleased = previousButtons;

    let previousPointers = state.pointersPressed;
    state.pointersPressed = pendingPointersPressed;
    pendingPointersPressed = previousPointers;

    previousPointers = state.pointersReleased;
    state.pointersReleased = pendingPointersReleased;
    pendingPointersReleased = previousPointers;

    state.wheelX = pendingWheelX;
    state.wheelY = pendingWheelY;
    pendingWheelX = 0;
    pendingWheelY = 0;
    pollGamepads();
  };
  const endInputStep = (): void => {
    state.keysPressed.clear();
    state.keysReleased.clear();
    state.mouseButtonsPressed.clear();
    state.mouseButtonsReleased.clear();
    state.wheelX = 0;
    state.wheelY = 0;
    for (let index = state.pointers.length - 1; index >= 0; index--) {
      const pointer = state.pointers[index] as MutablePointerInput;
      if (!pointer.isPressed && state.pointersReleased.has(pointer.id)) {
        pointersById.delete(pointer.id);
        state.pointers.splice(index, 1);
      } else {
        pointer.previousX = pointer.x;
        pointer.previousY = pointer.y;
      }
    }
    state.pointersPressed.clear();
    state.pointersReleased.clear();
    clearGamepadEdges(state.gamepadButtonsPressed);
    clearGamepadEdges(state.gamepadButtonsReleased);
    for (let index = state.gamepads.length - 1; index >= 0; index--) {
      const gamepad = state.gamepads[index]!;
      if (gamepad.connected) continue;
      gamepadsByIndex.delete(gamepad.index);
      state.gamepadButtonsPressed.delete(gamepad.index);
      state.gamepadButtonsReleased.delete(gamepad.index);
      state.gamepads.splice(index, 1);
    }
  };
  // Stable callback: stepFixed may call it several times per frame, so do not
  // allocate a closure in the per-frame path.
  const runSceneUpdate = (fixedDt: number): void => {
    if (stopped) return;
    beginInputStep();
    const previousContext = enterContext(sceneContext);
    try {
      pluginHost.preupdate(fixedDt);
      if (stopped) return;
      activeScene?.update?.(fixedDt, sceneContext);
      if (stopped) return;
      pluginHost.postupdate(fixedDt);
    } finally {
      restoreContext(previousContext);
      endInputStep();
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
    state.looping = false;
    sceneRevision++;
    cancelAnimationFrame(frameHandle);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("wheel", onWheel);
    globalThis.removeEventListener("pointerup", onPointerEnd);
    globalThis.removeEventListener("pointercancel", onPointerEnd);
    globalThis.removeEventListener("keydown", onKeyDown);
    globalThis.removeEventListener("keyup", onKeyUp);
    globalThis.removeEventListener("blur", onBlur);
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
        let pending: Scene<Api> | Promise<Scene<Api>>;
        try {
          pending = source(sceneContext);
        } finally {
          restoreContext(previousContext);
        }
        next = await pending;
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
