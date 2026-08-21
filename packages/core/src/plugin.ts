/**
 * The plugin system.
 *
 * The usual approach is to let extensions patch a shared prototype: the library
 * exposes one object, addons attach members to it, and every application sees them.
 * That works, but a prototype mutation is invisible to the type system — plugin
 * authors have to hand-write declaration merging to describe what they added,
 * and it is never checked against the implementation.
 *
 * Here a plugin *returns* what it contributes, so `use()` can accumulate the
 * contributions into the application type. No declaration merging, no ambient .d.ts,
 * and the types cannot drift from the runtime because they are derived from it.
 */

/** Lifecycle hooks a plugin may implement. All optional. */
export interface PluginLifecycle {
  /** Before setup runs. May be async. */
  presetup?: () => void | Promise<void>;
  /** After setup runs. May be async. */
  postsetup?: () => void | Promise<void>;
  /** Before each draw. */
  predraw?: (dt: number) => void;
  /** After each draw. */
  postdraw?: (dt: number) => void;
  /** On teardown. */
  dispose?: () => void;
}

/** What every plugin receives when it is set up. */
export interface PluginSetupContext {
  readonly name: string;
}

export interface Plugin<Contributes extends object = Record<never, never>> extends PluginLifecycle {
  readonly name: string;
  /** Returns the API this plugin adds to the application. */
  setup?: (host: PluginSetupContext) => Contributes;
}

/**
 * Identity function that pins `Contributes` from the `setup` return type, so
 * callers get inference without writing the type parameter.
 */
export function definePlugin<Contributes extends object>(
  plugin: Plugin<Contributes>,
): Plugin<Contributes> {
  return plugin;
}

export class DuplicatePluginError extends Error {
  readonly pluginName: string;

  constructor(name: string) {
    super(`A plugin named ${JSON.stringify(name)} is already registered`);
    this.name = "DuplicatePluginError";
    this.pluginName = name;
  }
}

/** Lifecycle dispatch plus everything registered plugins add. */
export interface PluginHost {
  readonly plugins: readonly string[];
  presetup: () => Promise<void>;
  postsetup: () => Promise<void>;
  predraw: (dt: number) => void;
  postdraw: (dt: number) => void;
  dispose: () => void;
}

/**
 * Accumulates plugin contributions into the resulting host type.
 *
 * Each `use` widens the parameter, so after
 * `.use(physics).use(audio)` the built value is
 * `PluginHost & PhysicsApi & AudioApi` — inferred, never declared.
 */
export interface PluginBuilder<Api extends object> {
  use: <Contributes extends object>(
    plugin: Plugin<Contributes>,
  ) => PluginBuilder<Api & Contributes>;
  build: () => PluginHost & Api;
}

export function createPluginHost(): PluginBuilder<Record<never, never>> {
  return builder([]);
}

/**
 * Await each hook before starting the next.
 *
 * Sequential is the contract, not an implementation detail: a plugin's setup
 * may depend on an earlier one having finished. Built as a promise chain
 * rather than a loop of awaits so the ordering is the shape of the code.
 * Promise.all here would be a silent behaviour change.
 */
function runInOrder(
  plugins: readonly Plugin<never>[],
  pick: (plugin: Plugin<never>) => (() => void | Promise<void>) | undefined,
): Promise<void> {
  return plugins.reduce<Promise<void>>(
    (chain, plugin) => chain.then(() => pick(plugin)?.()),
    Promise.resolve(),
  );
}

function builder<Api extends object>(plugins: readonly Plugin<never>[]): PluginBuilder<Api> {
  return {
    use<Contributes extends object>(plugin: Plugin<Contributes>): PluginBuilder<Api & Contributes> {
      if (plugins.some((p) => p.name === plugin.name)) {
        throw new DuplicatePluginError(plugin.name);
      }
      return builder<Api & Contributes>([...plugins, plugin as unknown as Plugin<never>]);
    },

    build(): PluginHost & Api {
      const api: Record<string, unknown> = {};

      for (const plugin of plugins) {
        const contributed = plugin.setup?.({ name: plugin.name });
        if (contributed === undefined) continue;
        for (const [key, value] of Object.entries(contributed)) {
          api[key] = value;
        }
      }

      const core: PluginHost = {
        plugins: plugins.map((p) => p.name),
        presetup: (): Promise<void> => runInOrder(plugins, (p) => p.presetup),
        postsetup: (): Promise<void> => runInOrder(plugins, (p) => p.postsetup),
        predraw: (dt: number): void => {
          for (const p of plugins) p.predraw?.(dt);
        },
        postdraw: (dt: number): void => {
          for (const p of plugins) p.postdraw?.(dt);
        },
        // Reverse order, so a plugin tears down before anything it depends on.
        dispose: (): void => {
          for (let i = plugins.length - 1; i >= 0; i--) plugins[i]?.dispose?.();
        },
      };

      return Object.assign(api, core) as PluginHost & Api;
    },
  };
}
