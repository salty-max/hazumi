import type { Noise, Rng } from "@hazumi/math";
import { getActiveContext, NoActiveSceneError } from "./active-context";
import type { Camera2D, CameraPoint } from "./camera";
import type { Capabilities, ShaderPass } from "@hazumi/graphics";

export { NoActiveSceneError };
export { tween, sequence, InvalidTweenError } from "./tween";
export type { Tween, TweenOptions } from "./tween";
export type { Camera2D, CameraPoint };
export type { Capabilities };

/** Live logical and physical dimensions for the active scene. */
export interface ScreenState {
  /** Logical width. What you draw in — not the backing store's. */
  readonly width: number;
  /** Logical height. */
  readonly height: number;
  /** Physical pixels per logical unit. 2 on a retina display. */
  readonly pixelRatio: number;
}

/** Live display-frame timing for the active scene. */
export interface TimeState {
  /** Frames drawn since the application started, counting from 0. */
  readonly frame: number;
  /** Seconds since it started. What an animation should be a function of. */
  readonly elapsed: number;
  /**
   * Seconds the last frame took, clamped by the clock's `maxDelta`.
   *
   * For `draw`, which gets no argument. `update` receives its own fixed step
   * and should use that instead.
   */
  readonly delta: number;
}

/**
 * What the backend this scene is running on can do.
 *
 * Ask before reaching for something only some backends have, rather than
 * finding out by being thrown at:
 *
 * ```ts
 * if (capabilities.shaders) setPasses([{ fragment: GRADE }]);
 * ```
 */
export const capabilities: Capabilities = {
  get shaders(): boolean {
    return getActiveContext().capabilities.shaders;
  },
  get pixels(): boolean {
    return getActiveContext().capabilities.pixels;
  },
  get text(): boolean {
    return getActiveContext().capabilities.text;
  },
  get materials(): boolean {
    return getActiveContext().capabilities.materials;
  },
};

/**
 * The canvas, in logical units: `screen.width`, `screen.height`, and the
 * device pixel ratio behind them.
 */
export const screen: ScreenState = {
  get width(): number {
    return getActiveContext().width;
  },
  get height(): number {
    return getActiveContext().height;
  },
  get pixelRatio(): number {
    return getActiveContext().pixelRatio;
  },
};

/**
 * The clock: `time.elapsed` since the application started, `time.delta` for the
 * last frame, `time.fps`.
 *
 * `update` receives its own `dt` and should use that; this is for `draw`, which
 * does not.
 */
export const time: TimeState = {
  get frame(): number {
    return getActiveContext().frameCount;
  },
  get elapsed(): number {
    return getActiveContext().t;
  },
  get delta(): number {
    return getActiveContext().dt;
  },
};

/**
 * The scene's own generator, seeded by `start({ seed })`.
 *
 * Deterministic on purpose: the same seed replays the same scene, which is
 * what makes a generated level reproducible and a bug in one findable twice.
 */
export const random: Rng = {
  get seed(): number {
    return getActiveContext().random.seed;
  },
  next: (): number => getActiveContext().random.next(),
  range: (min: number, max: number): number => getActiveContext().random.range(min, max),
  int: (min: number, max: number): number => getActiveContext().random.int(min, max),
  bool: (probability?: number): boolean => getActiveContext().random.bool(probability),
  pick: <T>(items: readonly T[]): T => getActiveContext().random.pick(items),
  gaussian: (): number => getActiveContext().random.gaussian(),
  clone: (): Rng => getActiveContext().random.clone(),
};

/**
 * A gradient-noise field seeded alongside `random`, for the smooth randomness
 * a generator cannot give: terrain, wind, drifting light.
 */
export const noise: Noise = {
  noise2: (x: number, y: number): number => getActiveContext().noise.noise2(x, y),
  noise3: (x: number, y: number, z: number): number => getActiveContext().noise.noise3(x, y, z),
  fbm2: (x: number, y: number, octaves?: number, persistence?: number): number =>
    getActiveContext().noise.fbm2(x, y, octaves, persistence),
};

/**
 * The view transform: pan, zoom, shake, and `follow` for a target worth
 * keeping centred.
 *
 * `camera.screen(body)` draws a block outside it, which is where a heads-up
 * display belongs.
 */
export const camera: Camera2D = {
  get x(): number {
    return getActiveContext().camera.x;
  },
  get y(): number {
    return getActiveContext().camera.y;
  },
  get zoom(): number {
    return getActiveContext().camera.zoom;
  },
  lookAt: (x: number, y: number): void => getActiveContext().camera.lookAt(x, y),
  follow: (x: number, y: number, amount?: number): void =>
    getActiveContext().camera.follow(x, y, amount),
  setZoom: (zoom: number): void => getActiveContext().camera.setZoom(zoom),
  worldToScreen: (x: number, y: number, out?: CameraPoint): CameraPoint =>
    getActiveContext().camera.worldToScreen(x, y, out),
  screenToWorld: (x: number, y: number, out?: CameraPoint): CameraPoint =>
    getActiveContext().camera.screenToWorld(x, y, out),
  screen: (body: () => void): void => getActiveContext().camera.screen(body),
};

/**
 * Install the post-processing chain, replacing whatever was there.
 *
 * Passes run in order over the whole frame. Throws where the backend has no
 * shader stage — ask `capabilities.shaders` first if that is possible.
 */
export function setPasses(passes: readonly ShaderPass[]): void {
  getActiveContext().setPasses(passes);
}

/**
 * Stop redrawing after the current frame.
 *
 * A scene that draws one deterministic image should say so rather than
 * repainting it sixty times a second.
 */
export function noLoop(): void {
  getActiveContext().noLoop();
}

/** Start redrawing again, after `noLoop`. */
export function loop(): void {
  getActiveContext().loop();
}

/** Whether frames are still being drawn. */
export function isLooping(): boolean {
  return getActiveContext().isLooping();
}
