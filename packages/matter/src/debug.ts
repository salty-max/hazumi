/**
 * Debug overlay plugin.
 *
 * Draws after the scene: optional rigid-body outlines in world space, then a
 * screen-space HUD. Lives in L5 because it encodes drawing commands. The
 * physics *solver* does not.
 */

import { Align, Baseline } from "@matter/graphics";
import { definePlugin, type Plugin } from "@matter/core";
import type { PhysicsApi } from "@matter/physics";
import { Shape, type RigidBody, type World } from "@matter/physics";
import { getActiveContext } from "./active-context";
import type { MatterContext } from "./context";

const STATIC_STROKE = "oklch(0.72 0.02 250)";
const DYNAMIC_STROKE = "oklch(0.82 0.18 145)";
const HUD_FILL = "oklch(0.92 0.02 250)";

/** Scene-facing overlay controls. */
export interface OverlayController {
  visible: boolean;
  /** FPS / frame time / body count, drawn in screen space. */
  stats: boolean;
  /** Wireframe rigid bodies, when a physics host is installed. */
  physics: boolean;
}

/** What the overlay plugin adds to a Matter scene context. */
export interface OverlayApi {
  readonly overlay: OverlayController;
}

export interface OverlayOptions {
  readonly visible?: boolean;
  readonly stats?: boolean;
  readonly physics?: boolean;
  /** `KeyboardEvent.key` that toggles `visible`. Omitted: no toggle. */
  readonly toggleKey?: string;
}

export class OverlayPluginInUseError extends Error {
  constructor() {
    super("This overlay plugin instance is already installed in an application");
    this.name = "OverlayPluginInUseError";
  }
}

/**
 * Create a debug overlay and install it on a Matter application.
 *
 * @example
 * const plugins = createPluginHost().use(physics()).use(overlay({ toggleKey: "F1" }));
 *
 * start({ backend: webgl2(), plugins }, ({ physics }) => {
 *   physics.world.addBox({ x: 300, y: 580, width: 600, height: 24, isStatic: true });
 *   return { draw() {} };
 * });
 */
export function overlay(options: OverlayOptions = {}): Plugin<OverlayApi> {
  let runtime: OverlayRuntime | null = null;
  return definePlugin<OverlayApi>({
    name: "overlay",
    setup: () => {
      if (runtime !== null) throw new OverlayPluginInUseError();
      runtime = createRuntime(options);
      return { overlay: runtime.controller };
    },
    preupdate: () => {
      const current = runtime;
      if (current === null) return;
      const key = current.toggleKey;
      if (key === undefined) return;
      if (getActiveContext().keyJustPressed(key)) {
        current.controller.visible = !current.controller.visible;
      }
    },
    postdraw: () => {
      const current = runtime;
      if (current === null || !current.controller.visible) return;
      drawOverlay(current, getActiveContext());
    },
    dispose: () => {
      runtime = null;
    },
  });
}

interface OverlayRuntime {
  readonly controller: OverlayController;
  readonly toggleKey: string | undefined;
  fps: number;
}

function createRuntime(options: OverlayOptions): OverlayRuntime {
  return {
    controller: {
      visible: options.visible ?? true,
      stats: options.stats ?? true,
      physics: options.physics ?? true,
    },
    toggleKey: options.toggleKey,
    fps: 0,
  };
}

function drawOverlay(runtime: OverlayRuntime, context: MatterContext): void {
  context.push();
  if (runtime.controller.physics) {
    const world = physicsWorld(context);
    if (world !== undefined) drawPhysics(context, world);
  }
  if (runtime.controller.stats) {
    if (context.dt > 0) {
      const instant = 1 / context.dt;
      runtime.fps += (instant - runtime.fps) * 0.15;
    }
    const world = physicsWorld(context);
    const bodies = world === undefined ? 0 : world.bodies.length;
    const fps = runtime.fps > 0 ? String(Math.round(runtime.fps)) : "—";
    const ms = (context.dt * 1000).toFixed(1);
    context.camera.screen(() => {
      context.noStroke();
      context.fill(HUD_FILL);
      context.textSize(13);
      context.textAlign(Align.Left, Baseline.Top);
      context.text(`${fps} fps`, 10, 10);
      context.text(`${ms} ms`, 10, 26);
      context.text(`${bodies} bodies`, 10, 42);
    });
  }
  context.pop();
}

function drawPhysics(context: MatterContext, world: World): void {
  context.noFill();
  context.strokeWeight(1);
  const bodies = world.bodies;
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (body === undefined) continue;
    context.stroke(body.isStatic ? STATIC_STROKE : DYNAMIC_STROKE);
    drawBody(context, body);
  }
}

function drawBody(context: MatterContext, body: RigidBody): void {
  if (body.shape === Shape.Circle) {
    context.circle(body.x, body.y, body.radius * 2);
    context.push();
    context.translate(body.x, body.y);
    context.rotate(body.angle);
    context.line(0, 0, body.radius, 0);
    context.pop();
    return;
  }
  context.push();
  context.translate(body.x, body.y);
  context.rotate(body.angle);
  context.rect(-body.width / 2, -body.height / 2, body.width, body.height);
  context.line(0, 0, body.width / 2, 0);
  context.pop();
}

function physicsWorld(context: MatterContext): World | undefined {
  const extra = context as MatterContext & Partial<PhysicsApi>;
  return extra.physics?.world;
}
