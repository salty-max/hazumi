/**
 * Debug overlay plugin.
 *
 * Draws after the scene: optional rigid-body outlines in world space, then a
 * screen-space HUD. Lives in L5 because it encodes drawing commands. The
 * physics *solver* does not.
 */

import { Align, Baseline } from "@hazumi/graphics";
import { definePlugin, type Plugin } from "@hazumi/core";
import type { PhysicsApi } from "@hazumi/physics";
import { Shape, type RigidBody, type World } from "@hazumi/physics";
import { getActiveContext } from "./active-context";
import type { HazumiContext } from "./context";

const STATIC_STROKE = "oklch(0.72 0.02 250)";
const DYNAMIC_STROKE = "oklch(0.82 0.18 145)";
/** A sleeping body is skipped by the solver, so it reads as inert, not active. */
const SLEEPING_STROKE = "oklch(0.55 0.06 145)";
const JOINT_STROKE = "oklch(0.85 0.16 85)";
const HUD_FILL = "oklch(0.92 0.02 250)";

/** Scene-facing overlay controls. */
export interface OverlayController {
  /** Whether anything is drawn at all. Writable, and what `toggleKey` flips. */
  visible: boolean;
  /** FPS / frame time / body count, drawn in screen space. */
  stats: boolean;
  /** Wireframe rigid bodies, when a physics host is installed. */
  physics: boolean;
}

/** What the overlay plugin adds to a Hazumi scene context. */
export interface OverlayApi {
  /** What the plugin adds to the scene context. */
  readonly overlay: OverlayController;
}

/** What the overlay shows, and how to toggle it. */
export interface OverlayOptions {
  /** Whether it starts shown. Defaults to true. */
  readonly visible?: boolean;
  /** Show FPS, frame time and body count. Defaults to true. */
  readonly stats?: boolean;
  /** Wireframe the rigid bodies, when a physics plugin is installed. Defaults to true. */
  readonly physics?: boolean;
  /** `KeyboardEvent.key` that toggles `visible`. Omitted: no toggle. */
  readonly toggleKey?: string;
}

/** One overlay plugin instance installed in two applications. */
export class OverlayPluginInUseError extends Error {
  constructor() {
    super("This overlay plugin instance is already installed in an application");
    this.name = "OverlayPluginInUseError";
  }
}

/**
 * Create a debug overlay and install it on a Hazumi application.
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

function drawOverlay(runtime: OverlayRuntime, context: HazumiContext): void {
  context.push();
  try {
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
      let awake = 0;
      if (world !== undefined) {
        for (const body of world.bodies) if (!body.isStatic && body.isAwake) awake++;
      }
      const fps = runtime.fps > 0 ? String(Math.round(runtime.fps)) : "—";
      const ms = (context.dt * 1000).toFixed(1);
      context.camera.screen(() => {
        context.noStroke();
        context.fill(HUD_FILL);
        context.textSize(13);
        context.textAlign(Align.Left, Baseline.Top);
        context.text(`${fps} fps`, 10, 10);
        context.text(`${ms} ms`, 10, 26);
        // Awake next to the total, because the gap between them is the whole
        // point of sleeping and is otherwise invisible.
        context.text(`${bodies} bodies · ${awake} awake`, 10, 42);
      });
    }
  } finally {
    context.pop();
  }
}

function drawPhysics(context: HazumiContext, world: World): void {
  context.noFill();
  context.strokeWeight(1);
  const bodies = world.bodies;
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (body === undefined) continue;
    if (body.isStatic) context.stroke(STATIC_STROKE);
    else context.stroke(body.isAwake ? DYNAMIC_STROKE : SLEEPING_STROKE);
    drawBody(context, body);
  }
  drawJoints(context, world);
}

const ANCHOR_A = { x: 0, y: 0 };
const ANCHOR_B = { x: 0, y: 0 };

function anchorPoint(body: RigidBody, lx: number, ly: number, out: { x: number; y: number }): void {
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  out.x = body.x + c * lx - s * ly;
  out.y = body.y + s * lx + c * ly;
}

/**
 * Joints as the line they hold, anchor to anchor.
 *
 * A constraint has no shape of its own, so a physics view without them draws a
 * rope bridge as a row of unrelated planks.
 */
function drawJoints(context: HazumiContext, world: World): void {
  context.stroke(JOINT_STROKE);
  for (const joint of world.joints) {
    anchorPoint(joint.a, joint.anchorAX, joint.anchorAY, ANCHOR_A);
    // A joint with no second body is pinned to a point in the world, and holds
    // that point directly rather than in anyone's local frame.
    if (joint.b === null) {
      ANCHOR_B.x = joint.anchorBX;
      ANCHOR_B.y = joint.anchorBY;
    } else {
      anchorPoint(joint.b, joint.anchorBX, joint.anchorBY, ANCHOR_B);
    }
    context.line(ANCHOR_A.x, ANCHOR_A.y, ANCHOR_B.x, ANCHOR_B.y);
    context.circle(ANCHOR_A.x, ANCHOR_A.y, 4);
    context.circle(ANCHOR_B.x, ANCHOR_B.y, 4);
  }
}

function drawBody(context: HazumiContext, body: RigidBody): void {
  if (body.shape === Shape.Circle) {
    context.circle(body.x, body.y, body.radius * 2);
    context.push();
    try {
      context.translate(body.x, body.y);
      context.rotate(body.angle);
      context.line(0, 0, body.radius, 0);
    } finally {
      context.pop();
    }
    return;
  }
  context.push();
  try {
    context.translate(body.x, body.y);
    context.rotate(body.angle);
    context.rect(-body.width / 2, -body.height / 2, body.width, body.height);
    context.line(0, 0, body.width / 2, 0);
  } finally {
    context.pop();
  }
}

function physicsWorld(context: HazumiContext): World | undefined {
  const extra = context as HazumiContext & Partial<PhysicsApi>;
  return extra.physics?.world;
}
