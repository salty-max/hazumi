/**
 * L1 — pure math: vectors, collision queries, grid pathfinding, and a rigid-body world.
 *
 * Matrices are 4x4 from day one: 2D is a constrained use of Mat4 so the 3D
 * addon does not require a migration later. See the "2D now, 3D later" section
 * of AGENTS.md.
 *
 * Vector modules are namespaced (`vec2.add`, `vec3.add`) because the operation
 * names collide by design.
 */

/** Two-component vectors: `vec2.add`, `vec2.dot`, and the rest. */
export * as vec2 from "./vec2";
/** Three-component vectors. Same operation names as `vec2`, hence the namespace. */
export * as vec3 from "./vec3";
/** 4x4 matrices. 2D is a constrained use of these — see the module note above. */
export * as mat4 from "./mat4";
/** Easing curves, each mapping 0–1 to 0–1. What `tween` interpolates through. */
export * as easing from "./easing";
/** Overlap, raycast and sweep queries. Pure functions over shapes, no world. */
export * as collision from "./collision";
/** A* over a grid, with a reusable path buffer so a search allocates nothing. */
export * as pathfind from "./pathfind";
/** A rigid-body world: bodies, joints, and a sequential-impulse solver. */
export * as physics from "./physics";

export type { Vec2 } from "./vec2";
export type { Vec3 } from "./vec3";
export type { Mat4 } from "./mat4";
export type { Easing } from "./easing";
export type { Aabb, Circle, RayHit, SweepHit } from "./collision";
export type { AstarOptions, Grid, Path } from "./pathfind";
export type {
  BodyOptions,
  BoxBodyOptions,
  CircleBodyOptions,
  DistanceJointOptions,
  Joint,
  JointKind,
  JointOptions,
  RaycastOptions,
  RigidBody,
  Shape,
  World,
  WorldOptions,
} from "./physics";

export { seeded } from "./rng";
export type { Rng } from "./rng";

export { createNoise } from "./noise";
export type { Noise } from "./noise";

export { lerp, clamp, norm, remap, degrees, radians, wrap, angleDelta, smoothstep } from "./scalar";
