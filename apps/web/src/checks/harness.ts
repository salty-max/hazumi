/**
 * Shared plumbing for the browser checks.
 *
 * The oracle in `bench/compare.ts` renders a scene through WebGL2 and through
 * Canvas2D and diffs them, which checks the rasteriser against the browser's
 * own. It cannot check anything Canvas2D has no answer for — a shader chain, a
 * material — so the newest parts of the renderer had nothing looking at them,
 * and a bug in one looked like a scene that was merely dark.
 *
 * These checks fill that in from the other side. Rather than compare against a
 * second implementation or a committed image, each one draws something whose
 * correct output is arithmetic, and reads the pixels back. That is robust
 * across drivers in a way a golden image is not: two machines disagree about
 * antialiasing and agree about whether a multiply by a quarter produced a
 * quarter.
 */
import { start, type HazumiApp, type ShaderPass } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  /** What was measured, so a failure reads as a number rather than as "false". */
  readonly detail: string;
}

/** Collects results, so a check body is one call rather than an object literal. */
export class CheckList {
  readonly checks: Check[] = [];

  record(name: string, ok: boolean, detail: string): void {
    this.checks.push({ name, ok, detail });
  }
}

/** Small enough to read back quickly, large enough to sample away from edges. */
export const SIZE = 64;

export interface Rendered {
  /** One physical pixel, as `[r, g, b, a]`. */
  at: (x: number, y: number) => readonly [number, number, number, number];
  /** What the frame cost, where the backend counts it. */
  drawCalls: number;
  stop: () => void;
}

export interface RenderOptions {
  readonly passes?: readonly ShaderPass[];
  readonly overlay?: () => void;
  /**
   * Off by default here, unlike in the renderer.
   *
   * Every material check measures a texel at a time, and a filtered sprite
   * drawn eight times its own size puts a gradient across the boundary the
   * check is trying to stand on.
   */
  readonly smoothing?: boolean;
}

/**
 * Draw a scene once and hand back its pixels.
 *
 * The canvas is tiny and the loop never starts: one `redraw` is the whole
 * frame, which keeps a check to one deterministic image.
 */
export async function render(draw: () => void, options: RenderOptions = {}): Promise<Rendered> {
  const host = document.createElement("div");
  document.body.append(host);
  const app: HazumiApp = start(
    {
      backend: webgl2({ smoothing: options.smoothing ?? false }),
      width: SIZE,
      height: SIZE,
      pixelRatio: 1,
      parent: host,
    },
    () => {
      const passes = options.passes ?? [];
      if (passes.length > 0) app.setPasses(passes);
      return options.overlay === undefined ? { draw } : { draw, overlay: options.overlay };
    },
  );
  await app.ready;
  app.redraw();
  const pixels = app.loadPixels();
  return {
    at: (x, y) => {
      const [r, g, b, a] = pixels.get(x, y);
      return [r, g, b, a] as const;
    },
    drawCalls: app.stats?.drawCalls ?? -1,
    stop: () => {
      app.stop();
      host.remove();
    },
  };
}

export function near(value: number, target: number, slack: number): boolean {
  return Math.abs(value - target) <= slack;
}
