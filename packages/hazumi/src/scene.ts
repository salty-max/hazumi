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
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/** Live display-frame timing for the active scene. */
export interface TimeState {
  readonly frame: number;
  readonly elapsed: number;
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
};

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

export const noise: Noise = {
  noise2: (x: number, y: number): number => getActiveContext().noise.noise2(x, y),
  noise3: (x: number, y: number, z: number): number => getActiveContext().noise.noise3(x, y, z),
  fbm2: (x: number, y: number, octaves?: number, persistence?: number): number =>
    getActiveContext().noise.fbm2(x, y, octaves, persistence),
};

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

export function setPasses(passes: readonly ShaderPass[]): void {
  getActiveContext().setPasses(passes);
}

export function noLoop(): void {
  getActiveContext().noLoop();
}

export function loop(): void {
  getActiveContext().loop();
}

export function isLooping(): boolean {
  return getActiveContext().isLooping();
}
