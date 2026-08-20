/**
 * Optional auto-import plugin: the modern replacement for p5's global mode.
 *
 * Rewrites bare `circle(50, 50, 20)` into explicit imports at build time, so the
 * ergonomics are inspectable instead of relying on window injection.
 */

export interface MatterPluginOptions {
  /** Which entry points are eligible for auto-import. */
  readonly include?: readonly string[];
}

// TODO(P7): the transform.
