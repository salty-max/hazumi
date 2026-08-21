/**
 * L0 — application lifecycle, clock, and the typed plugin registry.
 *
 * Depends on nothing. Knows nothing about drawing.
 */

export { AppClock } from "./clock";
export type { Clock, ClockOptions } from "./clock";

export { createPluginHost, definePlugin, DuplicatePluginError } from "./plugin";
export type {
  Plugin,
  PluginSetupContext,
  PluginLifecycle,
  PluginBuilder,
  PluginHost,
} from "./plugin";
