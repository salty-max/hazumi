import { SketchClock } from '@matter/core';
import { type BackendFactory, CommandBuffer } from '@matter/graphics';
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
}

/** Returned by setup; called once per frame. */
export type DrawFunction = (context: SketchContext) => void;

/**
 * Runs once. Whatever it returns becomes the draw loop; return nothing for a
 * sketch that renders a single frame.
 */
export type SetupFunction = (context: SketchContext) => DrawFunction | void;

export interface SketchHandle {
  readonly context: SketchContext;
  readonly canvas: HTMLCanvasElement;
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
    mouseIsPressed: false,
    looping: true,
  };

  const { context, beginFrame } = createContext({
    buffer,
    colors,
    state,
    seed: options.seed ?? 1,
  });

  const onMove = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = event.clientX - rect.left;
    state.mouseY = event.clientY - rect.top;
  };
  const onDown = (): void => {
    state.mouseIsPressed = true;
  };
  const onUp = (): void => {
    state.mouseIsPressed = false;
  };

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  globalThis.addEventListener('mouseup', onUp);

  const draw = setup(context) ?? null;
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
    if (draw !== null) draw(context);
    renderer.render(buffer);
  };

  const tick = (nowMs: number): void => {
    if (stopped) return;
    if (state.looping) renderFrame(nowMs);
    frameHandle = requestAnimationFrame(tick);
  };

  // A sketch with no draw function renders exactly one frame — whatever setup
  // already wrote into the buffer. Resetting here would erase it.
  if (draw === null) {
    renderer.render(buffer);
  } else {
    frameHandle = requestAnimationFrame(tick);
  }

  return {
    context,
    canvas,
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
      renderer.dispose();
      // A sketch that created its canvas has to take it away again, or
      // repeatedly starting and stopping one leaves orphaned canvases behind.
      if (ownsCanvas) canvas.remove();
    },
  };
}
