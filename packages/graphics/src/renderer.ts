import type { CommandBuffer } from './command-buffer';

/**
 * What every backend implements.
 *
 * Declared at L3 rather than in a backend package so `start()` can accept any
 * backend without importing one — the layer rule forbids graphics importing a
 * backend, and this is the seam that keeps that honest.
 */
export interface Renderer {
  /** Draw one frame from the command stream. */
  render: (buffer: CommandBuffer) => void;
  /** Called on construction and whenever the canvas is resized. */
  setViewport: (width: number, height: number) => void;
  /** Release GPU or canvas resources. */
  dispose: () => void;
}

/**
 * Backends export a factory rather than a class, so `start()` can own canvas
 * creation and sizing before the renderer exists.
 */
export type BackendFactory = (canvas: HTMLCanvasElement) => Renderer;
