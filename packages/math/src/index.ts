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

export * as vec2 from "./vec2";
export * as vec3 from "./vec3";
export * as mat4 from "./mat4";
export * as easing from "./easing";
export * as collision from "./collision";
export * as pathfind from "./pathfind";
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
