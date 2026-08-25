/**
 * Rigid-body plugin host.
 *
 * The solver is `@hazumi/math`'s `physics` world — pure `step(dt)`. This plugin
 * owns one world on the scene context and steps it after each fixed update so
 * a scene can spawn and apply impulses without calling `step` itself.
 *
 * It does not draw. Wire outlines belong to the debug overlay, which can see
 * `context.physics.world` once this plugin is installed.
 */

import { definePlugin, type Plugin } from "@hazumi/core";
import { physics as solver, type World, type WorldOptions } from "@hazumi/math";

export const Shape: typeof solver.Shape = solver.Shape;
export type Shape = (typeof Shape)[keyof typeof Shape];
export type {
  BodyOptions,
  BoxBodyOptions,
  CircleBodyOptions,
  DistanceJointOptions,
  Joint,
  JointOptions,
  RaycastOptions,
  RigidBody,
  World,
  WorldOptions,
} from "@hazumi/math";

export const JointKind: typeof solver.JointKind = solver.JointKind;
export type JointKind = (typeof JointKind)[keyof typeof JointKind];

/** Scene-facing rigid-body controls. */
export interface PhysicsController {
  /** The world the plugin owns and steps. Add bodies to this. */
  readonly world: World;
  /** When true, the host skips `world.step`. */
  paused: boolean;
  /** When true (the default), the host steps after each fixed update. */
  autoStep: boolean;
}

/** What the physics plugin adds to a Hazumi scene context. */
export interface PhysicsApi {
  /** What the plugin adds to the scene context. */
  readonly physics: PhysicsController;
}

/** Everything `createWorld` takes, plus how the plugin drives it. */
export interface PhysicsPluginOptions extends WorldOptions {
  /**
   * Step the world after each fixed update. Defaults to true. Turn it off to
   * keep the world on the context but call `world.step` yourself.
   */
  readonly autoStep?: boolean;
}

/**
 * One plugin instance installed twice.
 *
 * A plugin owns a world, and two applications sharing one would step it twice
 * per frame — so the second install is refused rather than silently doubling
 * everyone's gravity.
 */
export class PhysicsPluginInUseError extends Error {
  constructor() {
    super("This physics plugin instance is already installed in an application");
    this.name = "PhysicsPluginInUseError";
  }
}

/**
 * Create a rigid-body host and install it on a Hazumi application.
 *
 * @example
 * const plugins = createPluginHost().use(physics({ gravityY: 1600 }));
 *
 * start({ backend: webgl2(), plugins }, ({ physics }) => {
 *   physics.world.addCircle({ x: 200, y: 40, radius: 16 });
 *   return {
 *     draw() {
 *       for (const body of physics.world.bodies) {
 *         circle(body.x, body.y, body.radius * 2);
 *       }
 *     },
 *   };
 * });
 */
export function physics(options: PhysicsPluginOptions = {}): Plugin<PhysicsApi> {
  let runtime: PhysicsRuntime | null = null;
  return definePlugin<PhysicsApi>({
    name: "physics",
    setup: () => {
      if (runtime !== null) throw new PhysicsPluginInUseError();
      runtime = createRuntime(options);
      return { physics: runtime.controller };
    },
    postupdate: (fixedDt: number) => {
      const current = runtime;
      if (current === null) return;
      if (!current.controller.autoStep || current.controller.paused) return;
      current.controller.world.step(fixedDt);
    },
    dispose: () => {
      runtime?.dispose();
      runtime = null;
    },
  });
}

interface PhysicsRuntime {
  readonly controller: PhysicsController;
  dispose: () => void;
}

function createRuntime(options: PhysicsPluginOptions): PhysicsRuntime {
  const world = solver.world(options);
  const controller: PhysicsController = {
    world,
    paused: false,
    autoStep: options.autoStep ?? true,
  };
  return {
    controller,
    dispose: (): void => {
      world.clear();
    },
  };
}
