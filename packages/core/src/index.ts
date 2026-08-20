/**
 * L0 — sketch lifecycle, clock, and the typed plugin registry.
 *
 * Depends on nothing. Knows nothing about drawing.
 */

export { SketchClock } from './clock';
export type { Clock, ClockOptions } from './clock';

export {
  createSketch,
  definePlugin,
  DuplicatePluginError,
} from './plugin';
export type {
  Plugin,
  PluginHost,
  PluginLifecycle,
  SketchBuilder,
  SketchCore,
} from './plugin';
