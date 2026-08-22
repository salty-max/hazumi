import type { CommandBuffer } from "./command-buffer";

/** A top-down snapshot of a raster backend's physical RGBA pixels. */
export interface PixelData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * One user post-processing pass.
 *
 * `fragment` is only a `main()` — the runtime supplies `v_uv`, `fragColor`,
 * `u_texture` (the previous pass, or the scene), `u_resolution`, `u_time` and a
 * `texelSize()` helper, so the smallest useful effect is three lines. Extra
 * uniforms are declared in the source and supplied here.
 */
export interface ShaderPass {
  /** Fragment shader body, appended to the runtime's prelude. */
  readonly fragment: string;
  /** Custom uniforms, set before the pass draws. */
  readonly uniforms?: Readonly<Record<string, number | readonly number[]>>;
}

/**
 * What the last frame cost.
 *
 * Only the two figures every batching backend can honestly report. A backend
 * with more to say extends this rather than redeclaring it, so a consumer can
 * always read these two off any renderer that reports at all.
 */
export interface FrameStats {
  /** Draw calls issued for the last frame. */
  readonly drawCalls: number;
  /** Instances submitted across every instanced pipeline — shapes, glyphs, images. */
  readonly instances: number;
}

/**
 * What every backend implements.
 *
 * Declared at L3 rather than in a backend package so `start()` can accept any
 * backend without importing one — the layer rule forbids graphics importing a
 * backend, and this is the seam that keeps that honest.
 *
 * The optional members are the whole capability contract. They are declared
 * here, even though only some backends implement them, so that a backend author
 * can discover them by reading this interface. Before, the runtime declared
 * private structural types and sniffed for these at call sites, which meant the
 * only way to learn that implementing `setPasses` unlocks post-processing was
 * to read the runtime's source.
 */
export interface Renderer {
  /** Draw one frame from the command stream. */
  render: (buffer: CommandBuffer) => void;
  /** Called on construction and whenever the canvas is resized. */
  setViewport: (width: number, height: number) => void;
  /** Read physical canvas pixels, when the backend is raster-based. */
  readPixels?: () => PixelData;
  /** Replace physical canvas pixels, when the backend is raster-based. */
  writePixels?: (pixels: PixelData) => void;
  /**
   * Install the post-processing chain. Implement together with `setTime`;
   * a backend offering one without the other cannot animate a pass.
   */
  setPasses?: (passes: readonly ShaderPass[]) => void;
  /** Advance the clock the passes read as `u_time`, in seconds. */
  setTime?: (seconds: number) => void;
  /** What the last frame cost, where the backend counts it. */
  readonly stats?: FrameStats;
  /** Release GPU or canvas resources. */
  dispose: () => void;
}

/**
 * Backends export a factory rather than a class, so `start()` can own canvas
 * creation and sizing before the renderer exists.
 */
export type BackendFactory = (canvas: HTMLCanvasElement) => Renderer;
