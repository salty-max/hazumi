/**
 * L0 — sketch lifecycle, clock, and the typed plugin registry.
 *
 * Depends on nothing. Knows nothing about drawing.
 */

/** Lifecycle hooks a plugin may implement. All are optional. */
export interface PluginLifecycle {
  presetup?: () => void | Promise<void>;
  postsetup?: () => void | Promise<void>;
  predraw?: (dt: number) => void;
  postdraw?: (dt: number) => void;
  dispose?: () => void;
}

/** Placeholder for the phase-2 clock. */
export interface Clock {
  readonly frame: number;
  readonly elapsed: number;
  readonly dt: number;
}

// TODO(P2): lifecycle, fixed-timestep clock, and the plugin registry whose
// `use()` accumulates contributed types. See §03 L0 of the architecture doc.
