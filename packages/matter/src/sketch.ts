import { SketchClock } from '@matter/core';
import { type BackendFactory, CommandBuffer, type Renderer } from '@matter/graphics';
import { ColorCache } from './color-cache';
import {
  type ContextState,
  createContext,
  type SketchContext,
} from './context';

export interface SketchOptions {
  readonly backend: BackendFactory;
  readonly width?: number;
  readonly height?: number;
  /** Where to mount the canvas. Defaults to document.body. */
  readonly parent?: HTMLElement;
  /** Use an existing canvas instead of creating one. */
  readonly canvas?: HTMLCanvasElement;
  /**
   * Seed for `random` and `noise`. Fixed by default so a sketch renders
   * identically on every run; pass `Date.now()` for a different one each time.
   */
  readonly seed?: number;
  /** Device pixel ratio to render at. Defaults to the display's, capped at 2. */
  readonly pixelRatio?: number;
  /**
   * Called when `draw` throws.
   *
   * The loop stops either way — a sketch that throws does so on every frame,
   * and sixty identical stack traces a second buries the first one. Without a
   * handler the error is rethrown once, so it is never swallowed.
   */
  readonly onError?: (error: unknown) => void;
}

/** Returned by setup; called once per frame. */
export type DrawFunction = (context: SketchContext) => void;

/**
 * Runs once. Whatever it returns becomes the draw loop; return nothing for a
 * sketch that renders a single frame.
 *
 * May be async, which is how assets load — there is no separate preload phase.
 */
export type SetupFunction = (
  context: SketchContext,
) => DrawFunction | void | Promise<DrawFunction | void>;

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

/** A renderer that can run a post-processing chain. */
interface PostCapableRenderer extends Renderer {
  setPasses: (passes: readonly ShaderPass[]) => void;
  setTime: (seconds: number) => void;
}

function supportsPasses(renderer: Renderer): renderer is PostCapableRenderer {
  return (
    typeof (renderer as PostCapableRenderer).setPasses === 'function' &&
    typeof (renderer as PostCapableRenderer).setTime === 'function'
  );
}

export interface SketchHandle {
  readonly context: SketchContext;
  readonly canvas: HTMLCanvasElement;
  /** Resolves once setup has finished and the loop has started. */
  readonly ready: Promise<void>;
  /**
   * Replace the post-processing chain.
   *
   * Throws on a backend that cannot run passes — Canvas2D and SVG have no
   * shader stage, and silently ignoring the request would leave a sketch
   * looking wrong with nothing to explain why.
   */
  setPasses: (passes: readonly ShaderPass[]) => void;
  /** Draw exactly one frame. Useful when the loop is stopped. No-op after stop(). */
  redraw: () => void;
  /**
   * Stop the loop and release everything the sketch acquired: the frame
   * request, the input listeners, the backend, and the canvas itself if the
   * sketch created it.
   */
  stop: () => void;
  /** True once stop() has run. */
  readonly stopped: boolean;
}

const MAX_PIXEL_RATIO = 2;

/**
 * Create and run a sketch.
 *
 * ```ts
 * sketch({ backend: webgl2(), width: 600, height: 600 }, () => {
 *   return ({ circle, fill, width, height, t }) => {
 *     fill('oklch(70% 0.18 250)');
 *     circle(width / 2, height / 2, 200 + Math.sin(t) * 80);
 *   };
 * });
 * ```
 */
export function sketch(
  options: SketchOptions,
  setup: SetupFunction,
): SketchHandle {
  const width = options.width ?? 600;
  const height = options.height ?? 600;

  const canvas = options.canvas ?? document.createElement('canvas');
  const ratio = Math.min(
    options.pixelRatio ?? globalThis.devicePixelRatio ?? 1,
    MAX_PIXEL_RATIO,
  );

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (options.canvas === undefined) {
    (options.parent ?? document.body).append(canvas);
  }

  const renderer = options.backend(canvas);
  // The viewport is in device pixels; sketch coordinates stay in CSS pixels,
  // so a sketch does not have to know what display it landed on.
  renderer.setViewport(width, height);

  const buffer = new CommandBuffer();
  const colors = new ColorCache();
  const clock = new SketchClock();

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
    key: '',
    keysDown: new Set<string>(),
    looping: true,
  };

  const applyPasses = (passes: readonly ShaderPass[]): void => {
    if (!supportsPasses(renderer)) {
      throw new Error(
        'This backend cannot run shader passes. Only the WebGL2 backend has a ' +
          'shader stage; Canvas2D and SVG do not.',
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
    state.mouseX = event.clientX - rect.left;
    state.mouseY = event.clientY - rect.top;
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

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  globalThis.addEventListener('mouseup', onUp);
  globalThis.addEventListener('keydown', onKeyDown);
  globalThis.addEventListener('keyup', onKeyUp);
  globalThis.addEventListener('blur', onBlur);

  let draw: DrawFunction | null = null;
  let frameHandle = 0;
  let stopped = false;
  // Only reclaim the canvas if we put it in the document.
  const ownsCanvas = options.canvas === undefined;

  const renderFrame = (nowMs: number): void => {
    clock.advance(nowMs / 1000);
    state.frameCount = clock.frame;
    state.t = clock.elapsed;
    state.dt = clock.dt;

    buffer.reset();
    // The buffer is a fresh stream each frame, so the current style has to be
    // re-emitted into it before anything is drawn.
    beginFrame();

    try {
      if (draw !== null) draw(context);
      if (supportsPasses(renderer)) renderer.setTime(state.t);
      renderer.render(buffer);
    } catch (error) {
      // Stop before reporting: a throwing sketch throws every frame, and the
      // loop would otherwise bury the first error under sixty a second.
      state.looping = false;
      if (options.onError === undefined) throw error;
      options.onError(error);
    } finally {
      // Updated after the frame, not on the move event: a sketch reads
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

  /**
   * Setup may be async, so starting the loop has to wait for it. A synchronous
   * setup still starts on the same frame — Promise.resolve on a non-promise
   * settles in the current microtask.
   */
  const started = Promise.resolve(setup(context)).then((result) => {
    if (stopped) return;
    draw = result ?? null;

    // A sketch with no draw function renders exactly one frame — whatever
    // setup already wrote into the buffer. Resetting here would erase it.
    if (draw === null) renderer.render(buffer);
    else frameHandle = requestAnimationFrame(tick);
  });

  started.catch((error: unknown) => {
    stopped = true;
    if (options.onError === undefined) throw error;
    options.onError(error);
  });

  return {
    context,
    canvas,
    ready: started,
    setPasses: applyPasses,
    get stopped(): boolean {
      return stopped;
    },
    redraw: (): void => {
      // Drawing through a disposed renderer is at best a silent no-op and at
      // worst a use-after-free, so refuse rather than half-work.
      if (stopped) return;
      renderFrame(performance.now());
    },
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frameHandle);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      globalThis.removeEventListener('mouseup', onUp);
      globalThis.removeEventListener('keydown', onKeyDown);
      globalThis.removeEventListener('keyup', onKeyUp);
      globalThis.removeEventListener('blur', onBlur);
      renderer.dispose();
      // A sketch that created its canvas has to take it away again, or
      // repeatedly starting and stopping one leaves orphaned canvases behind.
      if (ownsCanvas) canvas.remove();
    },
  };
}
