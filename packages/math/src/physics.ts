/**
 * Impulse-based 2D rigid bodies.
 *
 * `collision` stays the query kit — AABB slide, rays, sweeps. This module is a
 * world: it integrates, detects, and resolves. Circles and oriented boxes,
 * gravity, restitution, friction, sequential impulses.
 *
 * Resting contact is held by accumulated, warm-started impulses. Restitution
 * is a one-shot velocity bias on new impacts so gravity does not re-bounce a
 * crate every frame. Boxes generate a clipped two-point manifold so they sit
 * instead of rocking on one vertex. Overlap is cleaned up with a mild
 * positional correction, not a Baumgarte velocity kick.
 *
 * Call `step` from a fixed update. Positions are centres; box angles are
 * radians, clockwise because y grows downward.
 */

import type { RayHit } from "./collision";

export const Shape = {
  Circle: 0,
  Box: 1,
} as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

export interface RigidBody {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
  restitution: number;
  friction: number;
  /** Fraction of linear velocity shed per second. 0 is a vacuum. */
  linearDamping: number;
  /** Fraction of angular velocity shed per second. */
  angularDamping: number;
  readonly shape: Shape;
  readonly radius: number;
  readonly width: number;
  readonly height: number;
  readonly mass: number;
  readonly invMass: number;
  readonly inertia: number;
  readonly invInertia: number;
  readonly isStatic: boolean;
  /**
   * False once the body has been still long enough to stop being simulated.
   *
   * A sleeping body is skipped by integration and by the solver, so a settled
   * pile costs nothing. Anything that could disturb it — an impulse, a force,
   * a moving body reaching it, a neighbour being removed — wakes it first.
   */
  readonly isAwake: boolean;
}

export interface BodyOptions {
  readonly x: number;
  readonly y: number;
  readonly angle?: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly omega?: number;
  readonly restitution?: number;
  readonly friction?: number;
  /** Linear velocity shed per second. Defaults to the world's. */
  readonly linearDamping?: number;
  /** Angular velocity shed per second. Defaults to the world's. */
  readonly angularDamping?: number;
  /** Mass per unit area. Ignored when `mass` or `isStatic` is set. Defaults to 1. */
  readonly density?: number;
  readonly mass?: number;
  readonly isStatic?: boolean;
}

export interface CircleBodyOptions extends BodyOptions {
  readonly radius: number;
}

export interface BoxBodyOptions extends BodyOptions {
  readonly width: number;
  readonly height: number;
}

export interface WorldOptions {
  readonly gravityX?: number;
  readonly gravityY?: number;
  /** Sequential-impulse iterations per step. Defaults to 10. */
  readonly iterations?: number;
  /**
   * Damping every new body starts with. Both default to 0, which is a vacuum:
   * a crate given a shove slides until something takes the energy off it.
   * Games usually want a little of both, so this is the one place to say so
   * rather than repeating it on every body.
   */
  readonly linearDamping?: number;
  readonly angularDamping?: number;
}

/**
 * What a joint ties together.
 *
 * Leaving `b` out pins to the world instead of to another body, in which case
 * `anchorBX`/`anchorBY` are world coordinates rather than local ones. Anchors
 * default to the centre of each body.
 */
export interface JointOptions {
  readonly a: RigidBody;
  readonly b?: RigidBody;
  readonly anchorAX?: number;
  readonly anchorAY?: number;
  readonly anchorBX?: number;
  readonly anchorBY?: number;
}

export interface DistanceJointOptions extends JointOptions {
  /** Defaults to however far apart the anchors are when the joint is made. */
  readonly length?: number;
}

export const JointKind = {
  Distance: 0,
  Pin: 1,
} as const;
export type JointKind = (typeof JointKind)[keyof typeof JointKind];

/** A constraint between two bodies, or between a body and the world. */
export interface Joint {
  readonly kind: JointKind;
  readonly a: RigidBody;
  /** Null when the joint is pinned to the world. */
  readonly b: RigidBody | null;
  readonly anchorAX: number;
  readonly anchorAY: number;
  readonly anchorBX: number;
  readonly anchorBY: number;
  /** Rest length. Zero for a pin. */
  length: number;
}

/** Where a ray stops, and what it should skip. */
export interface RaycastOptions {
  /** Defaults to unbounded. */
  readonly maxDistance?: number;
  /** Skipped entirely — usually whatever fired the ray. */
  readonly ignore?: RigidBody;
  /** Filled with the point, normal and distance. Reuse one and nothing is allocated. */
  readonly out?: RayHit;
}

export interface World {
  gravityX: number;
  gravityY: number;
  iterations: number;
  /** Damping handed to bodies added from now on. */
  linearDamping: number;
  angularDamping: number;
  readonly bodies: readonly RigidBody[];
  addCircle: (options: CircleBodyOptions) => RigidBody;
  addBox: (options: BoxBodyOptions) => RigidBody;
  remove: (body: RigidBody) => boolean;
  clear: () => void;
  applyForce: (body: RigidBody, fx: number, fy: number, px?: number, py?: number) => void;
  applyImpulse: (body: RigidBody, ix: number, iy: number, px?: number, py?: number) => void;
  /** Bring a sleeping body back into the simulation. */
  wake: (body: RigidBody) => void;
  /**
   * The nearest body a ray meets, or null.
   *
   * The body comes back as the return value and the geometry goes into
   * `options.out`, so a caller holding one hit object allocates nothing per
   * shot. Sleeping bodies are found like any other — sleeping is a shortcut
   * the solver takes, not invisibility.
   *
   * ```ts
   * const hit = createRayHit();
   * const target = world.raycast(x, y, aimX, aimY, { maxDistance: 400, ignore: player, out: hit });
   * ```
   */
  raycast: (
    x: number,
    y: number,
    dx: number,
    dy: number,
    options?: RaycastOptions,
  ) => RigidBody | null;
  /** The body a point falls inside, or null. The most recently added wins. */
  pointQuery: (x: number, y: number) => RigidBody | null;
  readonly joints: readonly Joint[];
  /** Hold two anchors a fixed distance apart — a rod, or a rope pulled taut. */
  addDistanceJoint: (options: DistanceJointOptions) => Joint;
  /** Hold two anchors at the same point, leaving rotation free — a hinge. */
  addPinJoint: (options: JointOptions) => Joint;
  removeJoint: (joint: Joint) => boolean;
  step: (dt: number) => void;
}

interface InternalBody extends RigidBody {
  fx: number;
  fy: number;
  torque: number;
  isAwake: boolean;
  /** Seconds this body has been below the sleep thresholds. */
  stillFor: number;
  /** This body's slot in the world, so contacts can be turned into indices. */
  index: number;
  /**
   * Creation order, and the only stable way to say which body of a pair is A.
   *
   * The broad phase visits pairs in whatever order the sweep reaches them, so
   * without this the roles would swap as bodies slide past each other — and a
   * contact whose A and B changed places matches no warm-start entry, leaving
   * the solver to rediscover every accumulated impulse from nothing.
   */
  uid: number;
  /** Union-find parent while sleep is decided. */
  island: number;
  /** World bounds for this step, already grown by the motion ahead of it. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** On an island root, the least still time in that island. */
  islandStill: number;
}

interface Contact {
  a: InternalBody;
  b: InternalBody;
  nx: number;
  ny: number;
  px: number;
  py: number;
  depth: number;
  pn: number;
  pt: number;
  velocityBias: number;
  /** Normal speed before this step's gravity, which is what restitution reads. */
  approach: number;
  /** Set while matching warm-start so two fresh points cannot clone one impulse. */
  matched: boolean;
}

interface MutablePoint {
  x: number;
  y: number;
}

const DEFAULT_RESTITUTION = 0.2;
const DEFAULT_FRICTION = 0.4;
const DEFAULT_DENSITY = 1;
const DEFAULT_ITERATIONS = 10;
/** Allow this much overlap, in world units, before correcting. Gravity * dt² sits inside it. */
const PENETRATION_SLOP = 0.5;
const POSITION_PERCENT = 0.4;
const MAX_LINEAR_CORRECTION = 2;
const RESTITUTION_THRESHOLD = 80;
const WARM_START_DISTANCE_SQ = 4;
/**
 * How still a body must be, and for how long, before it stops being simulated.
 *
 * The linear figure is in world units per second, so it is a fraction of a
 * pixel per frame — well under what a settled contact leaves behind, and well
 * under what an eye can see.
 */
const SLEEP_LINEAR_SPEED = 1.5;
const SLEEP_ANGULAR_SPEED = 0.08;
const SLEEP_DELAY = 0.4;
/** How close a removed body has to have been to count as someone's support. */
const WAKE_MARGIN = 2;

let nextUid = 0;

const CLIP_IN: readonly [MutablePoint, MutablePoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
const CLIP_OUT: readonly [MutablePoint, MutablePoint, MutablePoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
const CLIP_TMP: readonly [MutablePoint, MutablePoint, MutablePoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
const REF_A: MutablePoint = { x: 0, y: 0 };
const REF_B: MutablePoint = { x: 0, y: 0 };
const AXES_A: BoxAxes = { c: 0, s: 0, hw: 0, hh: 0 };
const AXES_B: BoxAxes = { c: 0, s: 0, hw: 0, hh: 0 };
const PROJECTION = { min: 0, max: 0 };
const SAT_STATE = { minOverlap: 0, nx: 0, ny: 0, axisIndex: 0 };

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
  return value;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number of 0 or more`);
  }
  return value;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function massProperties(
  area: number,
  inertiaShape: number,
  options: BodyOptions,
): {
  mass: number;
  invMass: number;
  inertia: number;
  invInertia: number;
} {
  if (options.isStatic === true) {
    return { mass: 0, invMass: 0, inertia: 0, invInertia: 0 };
  }
  const mass =
    options.mass !== undefined
      ? positive(options.mass, "mass")
      : positive(options.density ?? DEFAULT_DENSITY, "density") * area;
  const inertia = inertiaShape * mass;
  return {
    mass,
    invMass: 1 / mass,
    inertia,
    invInertia: inertia === 0 ? 0 : 1 / inertia,
  };
}

function createBody(
  shape: Shape,
  options: BodyOptions,
  defaults: { linearDamping: number; angularDamping: number },
  extra: Partial<InternalBody>,
): InternalBody {
  return {
    x: finite(options.x, "x"),
    y: finite(options.y, "y"),
    angle: finite(options.angle ?? 0, "angle"),
    vx: finite(options.vx ?? 0, "vx"),
    vy: finite(options.vy ?? 0, "vy"),
    omega: finite(options.omega ?? 0, "omega"),
    restitution: finite(options.restitution ?? DEFAULT_RESTITUTION, "restitution"),
    friction: finite(options.friction ?? DEFAULT_FRICTION, "friction"),
    linearDamping: nonNegative(options.linearDamping ?? defaults.linearDamping, "linearDamping"),
    angularDamping: nonNegative(
      options.angularDamping ?? defaults.angularDamping,
      "angularDamping",
    ),
    shape,
    radius: 0,
    width: 0,
    height: 0,
    mass: 0,
    invMass: 0,
    inertia: 0,
    invInertia: 0,
    isStatic: options.isStatic === true,
    isAwake: true,
    fx: 0,
    fy: 0,
    torque: 0,
    stillFor: 0,
    index: 0,
    uid: nextUid++,
    island: 0,
    islandStill: 0,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    ...extra,
  };
}

function wakeBody(body: InternalBody): void {
  if (body.invMass === 0) return;
  body.isAwake = true;
  body.stillFor = 0;
}

/** A body the solver can ignore: static, or asleep and staying that way. */
function isDormant(body: InternalBody): boolean {
  return body.invMass === 0 || !body.isAwake;
}

function applyImpulseOn(body: InternalBody, ix: number, iy: number, px: number, py: number): void {
  if (body.invMass === 0) return;
  body.vx += ix * body.invMass;
  body.vy += iy * body.invMass;
  body.omega += body.invInertia * cross2(px - body.x, py - body.y, ix, iy);
}

function applyForceOn(body: InternalBody, fx: number, fy: number, px: number, py: number): void {
  if (body.invMass === 0) return;
  body.fx += fx;
  body.fy += fy;
  body.torque += cross2(px - body.x, py - body.y, fx, fy);
}

/**
 * How far apart two bodies may be and still be worth a contact.
 *
 * A contact before the shapes touch is only useful if the solver can be told
 * how much room is left, so the reach is exactly the distance the pair can
 * close in one step. Anything further away cannot meet before the next step
 * looks again.
 */
function speculativeReach(a: InternalBody, b: InternalBody, dt: number): number {
  const sa = Math.abs(a.vx) + Math.abs(a.vy);
  const sb = Math.abs(b.vx) + Math.abs(b.vy);
  return (sa + sb) * dt;
}

function updateBounds(body: InternalBody, dt: number): void {
  let hw: number;
  let hh: number;
  if (body.shape === Shape.Circle) {
    hw = body.radius;
    hh = body.radius;
  } else {
    // Computed once per body per step. Doing it inside the pair test meant a
    // cosine and a sine for both bodies of every pair considered.
    const c = Math.abs(Math.cos(body.angle));
    const s = Math.abs(Math.sin(body.angle));
    hw = c * body.width * 0.5 + s * body.height * 0.5;
    hh = s * body.width * 0.5 + c * body.height * 0.5;
  }
  // Grown by this body's own travel: a pair test against another box grown the
  // same way is exactly the pair's combined reach.
  const travel = (Math.abs(body.vx) + Math.abs(body.vy)) * dt;
  body.minX = body.x - hw - travel;
  body.maxX = body.x + hw + travel;
  body.minY = body.y - hh - travel;
  body.maxY = body.y + hh + travel;
}

function addContact(
  contacts: Contact[],
  count: number,
  a: InternalBody,
  b: InternalBody,
  nx: number,
  ny: number,
  px: number,
  py: number,
  depth: number,
  reach: number,
): number {
  // A negative depth is a gap rather than an overlap. It is kept when the pair
  // can close that gap within the step, which is what stops a fast body from
  // stepping straight over a thin one.
  if (depth < -reach) return count;
  let contact = contacts[count];
  if (contact === undefined) {
    contact = {
      a,
      b,
      nx,
      ny,
      px,
      py,
      depth,
      pn: 0,
      pt: 0,
      velocityBias: 0,
      approach: 0,
      matched: false,
    };
    contacts[count] = contact;
  } else {
    contact.a = a;
    contact.b = b;
    contact.nx = nx;
    contact.ny = ny;
    contact.px = px;
    contact.py = py;
    contact.depth = depth;
    contact.pn = 0;
    contact.pt = 0;
    contact.velocityBias = 0;
    contact.approach = 0;
    contact.matched = false;
  }
  return count + 1;
}

function collideCircles(
  a: InternalBody,
  b: InternalBody,
  contacts: Contact[],
  count: number,
  reach: number,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const span = a.radius + b.radius;
  const limit = span + reach;
  if (distSq > limit * limit) return count;
  let nx: number;
  let ny: number;
  let dist: number;
  if (distSq === 0) {
    nx = 1;
    ny = 0;
    dist = 0;
  } else {
    dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
  }
  const px = a.x + nx * a.radius;
  const py = a.y + ny * a.radius;
  return addContact(contacts, count, a, b, nx, ny, px, py, span - dist, reach);
}

function collideCircleBox(
  circle: InternalBody,
  box: InternalBody,
  circleIsA: boolean,
  contacts: Contact[],
  count: number,
  reach: number,
): number {
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  const dx = circle.x - box.x;
  const dy = circle.y - box.y;
  const lx = c * dx + s * dy;
  const ly = -s * dx + c * dy;
  const hw = box.width * 0.5;
  const hh = box.height * 0.5;
  const clampedX = Math.max(-hw, Math.min(hw, lx));
  const clampedY = Math.max(-hh, Math.min(hh, ly));
  let localNx: number;
  let localNy: number;
  let depth: number;
  let localPx: number;
  let localPy: number;

  if (clampedX === lx && clampedY === ly) {
    const gapX = hw - Math.abs(lx);
    const gapY = hh - Math.abs(ly);
    if (gapX < gapY) {
      const sign = lx >= 0 ? 1 : -1;
      localNx = sign;
      localNy = 0;
      depth = gapX + circle.radius;
      localPx = sign * hw;
      localPy = ly;
    } else {
      const sign = ly >= 0 ? 1 : -1;
      localNx = 0;
      localNy = sign;
      depth = gapY + circle.radius;
      localPx = lx;
      localPy = sign * hh;
    }
  } else {
    const ox = lx - clampedX;
    const oy = ly - clampedY;
    const distSq = ox * ox + oy * oy;
    const limit = circle.radius + reach;
    if (distSq > limit * limit) return count;
    const dist = Math.sqrt(distSq);
    localNx = ox / dist;
    localNy = oy / dist;
    depth = circle.radius - dist;
    localPx = clampedX;
    localPy = clampedY;
  }

  // localNx is from box toward circle. World n from A to B needs a sign flip
  // when the circle is A (n should point at the box).
  let nx = c * localNx - s * localNy;
  let ny = s * localNx + c * localNy;
  if (circleIsA) {
    nx = -nx;
    ny = -ny;
  }
  const px = box.x + c * localPx - s * localPy;
  const py = box.y + s * localPx + c * localPy;
  const a = circleIsA ? circle : box;
  const b = circleIsA ? box : circle;
  return addContact(contacts, count, a, b, nx, ny, px, py, depth, reach);
}

interface BoxAxes {
  c: number;
  s: number;
  hw: number;
  hh: number;
}

function fillAxes(body: InternalBody, out: BoxAxes): void {
  out.c = Math.cos(body.angle);
  out.s = Math.sin(body.angle);
  out.hw = body.width * 0.5;
  out.hh = body.height * 0.5;
}

function projectBox(body: InternalBody, axes: BoxAxes, ax: number, ay: number): void {
  const extent =
    Math.abs(axes.c * ax + axes.s * ay) * axes.hw + Math.abs(-axes.s * ax + axes.c * ay) * axes.hh;
  const mid = body.x * ax + body.y * ay;
  PROJECTION.min = mid - extent;
  PROJECTION.max = mid + extent;
}

function worldPoint(
  body: InternalBody,
  axes: BoxAxes,
  lx: number,
  ly: number,
  out: MutablePoint,
): void {
  out.x = body.x + axes.c * lx - axes.s * ly;
  out.y = body.y + axes.s * lx + axes.c * ly;
}

function incidentFace(
  body: InternalBody,
  axes: BoxAxes,
  nx: number,
  ny: number,
  out0: MutablePoint,
  out1: MutablePoint,
): void {
  const d0 = axes.c * nx + axes.s * ny;
  const d1 = -axes.s * nx + axes.c * ny;
  const d2 = -axes.c * nx - axes.s * ny;
  const d3 = axes.s * nx - axes.c * ny;
  let best = 0;
  let bestDot = d0;
  if (d1 < bestDot) {
    best = 1;
    bestDot = d1;
  }
  if (d2 < bestDot) {
    best = 2;
    bestDot = d2;
  }
  if (d3 < bestDot) best = 3;
  const hw = axes.hw;
  const hh = axes.hh;
  if (best === 0) {
    worldPoint(body, axes, hw, hh, out0);
    worldPoint(body, axes, hw, -hh, out1);
  } else if (best === 1) {
    worldPoint(body, axes, -hw, hh, out0);
    worldPoint(body, axes, hw, hh, out1);
  } else if (best === 2) {
    worldPoint(body, axes, -hw, -hh, out0);
    worldPoint(body, axes, -hw, hh, out1);
  } else {
    worldPoint(body, axes, hw, -hh, out0);
    worldPoint(body, axes, -hw, -hh, out1);
  }
}

function clipSegment(
  v0: MutablePoint,
  v1: MutablePoint,
  nx: number,
  ny: number,
  offset: number,
  out: readonly MutablePoint[],
): number {
  const d0 = nx * v0.x + ny * v0.y - offset;
  const d1 = nx * v1.x + ny * v1.y - offset;
  let n = 0;
  if (d0 <= 0) {
    const p = out[n];
    if (p !== undefined) {
      p.x = v0.x;
      p.y = v0.y;
      n++;
    }
  }
  if (d1 <= 0) {
    const p = out[n];
    if (p !== undefined) {
      p.x = v1.x;
      p.y = v1.y;
      n++;
    }
  }
  if (d0 * d1 < 0) {
    const p = out[n];
    if (p !== undefined) {
      const t = d0 / (d0 - d1);
      p.x = v0.x + t * (v1.x - v0.x);
      p.y = v0.y + t * (v1.y - v0.y);
      n++;
    }
  }
  return n;
}

function considerAxis(
  a: InternalBody,
  b: InternalBody,
  axesA: BoxAxes,
  axesB: BoxAxes,
  ax: number,
  ay: number,
  index: number,
  state: { minOverlap: number; nx: number; ny: number; axisIndex: number },
  reach: number,
): boolean {
  projectBox(a, axesA, ax, ay);
  const minA = PROJECTION.min;
  const maxA = PROJECTION.max;
  projectBox(b, axesB, ax, ay);
  // Negative overlap is a gap on this axis. Beyond the reach it is a genuine
  // separating axis; within it, the pair still meets this step.
  const overlap = Math.min(maxA, PROJECTION.max) - Math.max(minA, PROJECTION.min);
  if (overlap < -reach) return false;
  if ((b.x - a.x) * ax + (b.y - a.y) * ay < 0) {
    ax = -ax;
    ay = -ay;
  }
  if (overlap < state.minOverlap) {
    state.minOverlap = overlap;
    state.nx = ax;
    state.ny = ay;
    state.axisIndex = index;
  }
  return true;
}

function collideBoxes(
  a: InternalBody,
  b: InternalBody,
  contacts: Contact[],
  count: number,
  reach: number,
): number {
  fillAxes(a, AXES_A);
  fillAxes(b, AXES_B);
  SAT_STATE.minOverlap = Infinity;
  SAT_STATE.nx = 1;
  SAT_STATE.ny = 0;
  SAT_STATE.axisIndex = 0;
  if (!considerAxis(a, b, AXES_A, AXES_B, AXES_A.c, AXES_A.s, 0, SAT_STATE, reach)) return count;
  if (!considerAxis(a, b, AXES_A, AXES_B, -AXES_A.s, AXES_A.c, 1, SAT_STATE, reach)) return count;
  if (!considerAxis(a, b, AXES_A, AXES_B, AXES_B.c, AXES_B.s, 2, SAT_STATE, reach)) return count;
  if (!considerAxis(a, b, AXES_A, AXES_B, -AXES_B.s, AXES_B.c, 3, SAT_STATE, reach)) return count;

  const { nx, ny, axisIndex, minOverlap } = SAT_STATE;
  const refIsA = axisIndex < 2;
  const ref = refIsA ? a : b;
  const inc = refIsA ? b : a;
  const refAxes = refIsA ? AXES_A : AXES_B;
  const incAxes = refIsA ? AXES_B : AXES_A;
  const frontX = refIsA ? nx : -nx;
  const frontY = refIsA ? ny : -ny;
  const sideX = -frontY;
  const sideY = frontX;

  incidentFace(inc, incAxes, frontX, frontY, CLIP_IN[0], CLIP_IN[1]);

  const hw = refAxes.hw;
  const hh = refAxes.hh;
  const localFrontX = refAxes.c * frontX + refAxes.s * frontY;
  const localFrontY = -refAxes.s * frontX + refAxes.c * frontY;
  if (Math.abs(localFrontX) >= Math.abs(localFrontY)) {
    const x = localFrontX >= 0 ? hw : -hw;
    worldPoint(ref, refAxes, x, hh, REF_A);
    worldPoint(ref, refAxes, x, -hh, REF_B);
  } else {
    const y = localFrontY >= 0 ? hh : -hh;
    worldPoint(ref, refAxes, hw, y, REF_A);
    worldPoint(ref, refAxes, -hw, y, REF_B);
  }
  if (sideX * REF_A.x + sideY * REF_A.y > sideX * REF_B.x + sideY * REF_B.y) {
    const sx = REF_A.x;
    const sy = REF_A.y;
    REF_A.x = REF_B.x;
    REF_A.y = REF_B.y;
    REF_B.x = sx;
    REF_B.y = sy;
  }

  const frontOffset = frontX * REF_A.x + frontY * REF_A.y;
  const negSide = -(sideX * REF_A.x + sideY * REF_A.y);
  const posSide = sideX * REF_B.x + sideY * REF_B.y;

  let n = clipSegment(CLIP_IN[0], CLIP_IN[1], -sideX, -sideY, negSide, CLIP_TMP);
  const t0 = CLIP_TMP[0] as MutablePoint;
  const t1 = CLIP_TMP[1] as MutablePoint;
  if (n >= 2) n = clipSegment(t0, t1, sideX, sideY, posSide, CLIP_OUT);
  else if (n === 1) {
    const p = CLIP_OUT[0];
    if (p !== undefined) {
      p.x = t0.x;
      p.y = t0.y;
    }
  }

  let added = count;
  for (let i = 0; i < n; i++) {
    const p = CLIP_OUT[i];
    if (p === undefined) continue;
    const separation = frontX * p.x + frontY * p.y - frontOffset;
    if (separation > Math.max(PENETRATION_SLOP, reach)) continue;
    added = addContact(contacts, added, a, b, nx, ny, p.x, p.y, -separation, reach);
  }
  if (added !== count) return added;

  const incident = CLIP_IN[0];
  return addContact(contacts, count, a, b, nx, ny, incident.x, incident.y, minOverlap, reach);
}

/** Sorted by where each body starts on x, so the sweep can stop early. */
function byMinX(a: InternalBody, b: InternalBody): number {
  return a.minX - b.minX;
}

/**
 * Pairs worth testing, by sweeping a sorted axis rather than trying everything.
 *
 * Comparing every body with every other is fine for a handful and quadratic
 * after that: 600 falling boxes spent 12.4 ms a step there, past a whole frame
 * at 60Hz. Sorting on x and walking forward until a body starts beyond where
 * the current one ends visits neighbours instead. The sort itself is nearly
 * free in practice — the order barely changes between steps, and that is
 * exactly the case a merge sort finishes in one pass.
 */
function findContacts(
  bodies: readonly InternalBody[],
  sorted: InternalBody[],
  contacts: Contact[],
  dt: number,
): number {
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (body === undefined) continue;
    updateBounds(body, dt);
    sorted[i] = body;
  }
  sorted.length = bodies.length;
  sorted.sort(byMinX);

  let count = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b === undefined) continue;
      // Sorted, so nothing further along can reach back either.
      if (b.minX > a.maxX) break;
      if (a.maxY < b.minY || b.maxY < a.minY) continue;
      // Two bodies that cannot move between them have nothing to resolve. That
      // is what makes a settled pile free rather than merely quiet.
      if (isDormant(a) && isDormant(b)) continue;
      // Something that can move has reached a sleeper, so it is no longer
      // entitled to sit the step out.
      if (!a.isAwake) wakeBody(a);
      if (!b.isAwake) wakeBody(b);
      // Creation order, not sweep order: see `uid`.
      const first = a.uid < b.uid ? a : b;
      const second = a.uid < b.uid ? b : a;
      const reach = speculativeReach(first, second, dt);
      if (first.shape === Shape.Circle && second.shape === Shape.Circle) {
        count = collideCircles(first, second, contacts, count, reach);
      } else if (first.shape === Shape.Circle && second.shape === Shape.Box) {
        count = collideCircleBox(first, second, true, contacts, count, reach);
      } else if (first.shape === Shape.Box && second.shape === Shape.Circle) {
        count = collideCircleBox(second, first, false, contacts, count, reach);
      } else {
        count = collideBoxes(first, second, contacts, count, reach);
      }
    }
  }
  return count;
}

function relativeNormalSpeed(contact: Contact): number {
  const { a, b, nx, ny, px, py } = contact;
  const rax = px - a.x;
  const ray = py - a.y;
  const rbx = px - b.x;
  const rby = py - b.y;
  const dvx = b.vx - b.omega * rby - a.vx + a.omega * ray;
  const dvy = b.vy + b.omega * rbx - a.vy - a.omega * rax;
  return dvx * nx + dvy * ny;
}

function matchWarmStart(
  fresh: readonly Contact[],
  freshCount: number,
  stale: readonly Contact[],
  staleCount: number,
): void {
  for (let j = 0; j < staleCount; j++) {
    const previous = stale[j];
    if (previous !== undefined) previous.matched = false;
  }
  for (let i = 0; i < freshCount; i++) {
    const contact = fresh[i];
    if (contact === undefined) continue;
    let best = -1;
    let bestDist = WARM_START_DISTANCE_SQ;
    for (let j = 0; j < staleCount; j++) {
      const previous = stale[j];
      if (
        previous === undefined ||
        previous.matched ||
        previous.a !== contact.a ||
        previous.b !== contact.b
      ) {
        continue;
      }
      const dx = previous.px - contact.px;
      const dy = previous.py - contact.py;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = j;
      }
    }
    if (best === -1) continue;
    const previous = stale[best];
    if (previous === undefined) continue;
    previous.matched = true;
    contact.pn = previous.pn;
    contact.pt = previous.pt;
  }
}

function applyWarmStart(contact: Contact): void {
  if (contact.pn === 0 && contact.pt === 0) return;
  const tx = -contact.ny;
  const ty = contact.nx;
  const ix = contact.nx * contact.pn + tx * contact.pt;
  const iy = contact.ny * contact.pn + ty * contact.pt;
  applyImpulseOn(contact.a, -ix, -iy, contact.px, contact.py);
  applyImpulseOn(contact.b, ix, iy, contact.px, contact.py);
}

function solveContact(contact: Contact): void {
  const { a, b, nx, ny, px, py } = contact;
  const rax = px - a.x;
  const ray = py - a.y;
  const rbx = px - b.x;
  const rby = py - b.y;
  const dvx = b.vx - b.omega * rby - a.vx + a.omega * ray;
  const dvy = b.vy + b.omega * rbx - a.vy - a.omega * rax;
  const vn = dvx * nx + dvy * ny;

  const rnA = cross2(rax, ray, nx, ny);
  const rnB = cross2(rbx, rby, nx, ny);
  const invMassN = a.invMass + b.invMass + a.invInertia * rnA * rnA + b.invInertia * rnB * rnB;
  if (invMassN === 0) return;

  let lambda = -(vn - contact.velocityBias) / invMassN;
  const pnOld = contact.pn;
  contact.pn = Math.max(0, pnOld + lambda);
  lambda = contact.pn - pnOld;
  applyImpulseOn(a, -nx * lambda, -ny * lambda, px, py);
  applyImpulseOn(b, nx * lambda, ny * lambda, px, py);

  const tx = -ny;
  const ty = nx;
  const tvx = b.vx - b.omega * rby - a.vx + a.omega * ray;
  const tvy = b.vy + b.omega * rbx - a.vy - a.omega * rax;
  const vt = tvx * tx + tvy * ty;
  const rtA = cross2(rax, ray, tx, ty);
  const rtB = cross2(rbx, rby, tx, ty);
  const invMassT = a.invMass + b.invMass + a.invInertia * rtA * rtA + b.invInertia * rtB * rtB;
  if (invMassT === 0) return;
  let tangentLambda = -vt / invMassT;
  const ptOld = contact.pt;
  // The geometric mean, not the larger of the two: with a maximum, a body
  // given `friction: 0` still grips anything grippy, so the property silently
  // does nothing unless every surface it can touch agrees with it.
  const maxFriction = Math.sqrt(a.friction * b.friction) * contact.pn;
  contact.pt = Math.min(maxFriction, Math.max(-maxFriction, ptOld + tangentLambda));
  tangentLambda = contact.pt - ptOld;
  applyImpulseOn(a, -tx * tangentLambda, -ty * tangentLambda, px, py);
  applyImpulseOn(b, tx * tangentLambda, ty * tangentLambda, px, py);
}

/** Union-find root, flattening the path it walks. */
function islandRoot(bodies: readonly InternalBody[], start: number): number {
  let i = start;
  for (;;) {
    const body = bodies[i];
    if (body === undefined || body.island === i) return i;
    const parent = bodies[body.island];
    if (parent !== undefined) body.island = parent.island;
    i = body.island;
  }
}

function joinIslands(bodies: readonly InternalBody[], a: number, b: number): void {
  const rootA = islandRoot(bodies, a);
  const rootB = islandRoot(bodies, b);
  if (rootA === rootB) return;
  const body = bodies[rootB];
  if (body !== undefined) body.island = rootA;
}

/**
 * Move a joint's bodies back towards where the constraint says they belong.
 *
 * Translation only, like the contact correction next to it: turning a body to
 * fix an anchor would need the same care rotation always needs, and the
 * velocity solve is what actually holds a joint together. This only mops up
 * the drift the solve leaves behind.
 */
function correctJoint(joint: InternalJoint): void {
  const { a, b } = joint;
  const invSum = a.invMass + (b === null ? 0 : b.invMass);
  if (invSum === 0) return;

  jointAnchor(a, joint.anchorAX, joint.anchorAY, JOINT_A);
  jointAnchor(b, joint.anchorBX, joint.anchorBY, JOINT_B);
  let ex = JOINT_B.x - JOINT_A.x;
  let ey = JOINT_B.y - JOINT_A.y;

  if (joint.kind === JointKind.Distance) {
    const separation = Math.hypot(ex, ey);
    if (separation === 0) return;
    const error = separation - joint.length;
    ex = (ex / separation) * error;
    ey = (ey / separation) * error;
  }

  const size = Math.hypot(ex, ey);
  if (size === 0) return;
  const step = Math.min(size * JOINT_CORRECTION, MAX_JOINT_CORRECTION) / size;
  const scale = step / invSum;
  a.x += ex * scale * a.invMass;
  a.y += ey * scale * a.invMass;
  if (b !== null) {
    b.x -= ex * scale * b.invMass;
    b.y -= ey * scale * b.invMass;
  }
}

function correctPositions(contact: Contact): void {
  const { a, b, nx, ny, depth } = contact;
  const correction = Math.min(
    Math.max(depth - PENETRATION_SLOP, 0) * POSITION_PERCENT,
    MAX_LINEAR_CORRECTION,
  );
  if (correction === 0) return;
  const inv = a.invMass + b.invMass;
  if (inv === 0) return;
  const scale = correction / inv;
  a.x -= nx * scale * a.invMass;
  a.y -= ny * scale * a.invMass;
  b.x += nx * scale * b.invMass;
  b.y += ny * scale * b.invMass;
}

/**
 * Distance along a unit ray to a circle, or -1.
 *
 * A ray that starts inside reports 0, matching `raycastAabb` — the caller
 * asked what the ray meets, and it is already touching this one.
 */
function rayCircle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  radius: number,
): number {
  const mx = ox - cx;
  const my = oy - cy;
  const outside = mx * mx + my * my - radius * radius;
  if (outside <= 0) return 0;
  const along = mx * dx + my * dy;
  // Outside and pointing away.
  if (along > 0) return -1;
  const discriminant = along * along - outside;
  if (discriminant < 0) return -1;
  return -along - Math.sqrt(discriminant);
}

/** Distance along a unit ray to an oriented box, or -1. Writes the normal. */
function rayBox(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  body: InternalBody,
  normal: MutablePoint,
): number {
  // Solved in the box's own frame, where it is axis-aligned and the test is
  // two slabs; the normal is turned back at the end.
  const c = Math.cos(body.angle);
  const sn = Math.sin(body.angle);
  const rx = ox - body.x;
  const ry = oy - body.y;
  const lx = c * rx + sn * ry;
  const ly = -sn * rx + c * ry;
  const ldx = c * dx + sn * dy;
  const ldy = -sn * dx + c * dy;
  const hw = body.width * 0.5;
  const hh = body.height * 0.5;

  if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
    normal.x = 0;
    normal.y = 0;
    return 0;
  }

  let near = -Infinity;
  let far = Infinity;
  let axis = 0;
  let sign = 0;

  if (ldx === 0) {
    if (lx < -hw || lx > hw) return -1;
  } else {
    const inverse = 1 / ldx;
    let t0 = (-hw - lx) * inverse;
    let t1 = (hw - lx) * inverse;
    let face = inverse >= 0 ? -1 : 1;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
      face = -face;
    }
    if (t0 > near) {
      near = t0;
      axis = 0;
      sign = face;
    }
    if (t1 < far) far = t1;
  }

  if (ldy === 0) {
    if (ly < -hh || ly > hh) return -1;
  } else {
    const inverse = 1 / ldy;
    let t0 = (-hh - ly) * inverse;
    let t1 = (hh - ly) * inverse;
    let face = inverse >= 0 ? -1 : 1;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
      face = -face;
    }
    if (t0 > near) {
      near = t0;
      axis = 1;
      sign = face;
    }
    if (t1 < far) far = t1;
  }

  if (near > far || far < 0) return -1;
  const localNx = axis === 0 ? sign : 0;
  const localNy = axis === 0 ? 0 : sign;
  normal.x = c * localNx - sn * localNy;
  normal.y = sn * localNx + c * localNy;
  return near;
}

function containsPoint(body: InternalBody, x: number, y: number): boolean {
  if (body.shape === Shape.Circle) {
    const dx = x - body.x;
    const dy = y - body.y;
    return dx * dx + dy * dy <= body.radius * body.radius;
  }
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  const rx = x - body.x;
  const ry = y - body.y;
  const lx = c * rx + s * ry;
  const ly = -s * rx + c * ry;
  return Math.abs(lx) <= body.width * 0.5 && Math.abs(ly) <= body.height * 0.5;
}

const RAY_NORMAL: MutablePoint = { x: 0, y: 0 };

interface InternalJoint extends Joint {
  a: InternalBody;
  b: InternalBody | null;
  /**
   * Accumulated impulse, kept across steps so the solver starts warm.
   *
   * A distance joint pulls only along its own axis, so it keeps a signed
   * scalar and rebuilds the direction each step: storing the vector instead
   * means last step's impulse is re-applied along an axis the joint has since
   * swung away from, and nothing ever takes that back — a rope struck side-on
   * gains energy every step until its links leave the world.
   *
   * A pin constrains a point in two directions at once, so there the vector is
   * the constraint.
   */
  impulse: number;
  impulseX: number;
  impulseY: number;
}

/**
 * How much of a joint's position error is taken out per step, by moving the
 * bodies rather than by pushing on their velocities.
 *
 * Folding the correction into the velocity solve instead is what a Baumgarte
 * bias does, and it pumps energy here: a contact clamps its accumulated
 * impulse at zero, so the pumping is bounded, but a joint is bilateral and
 * nothing bounds it. Warm starting then re-applies last step's bias on top of
 * this step's, and a rope with a weight on the end reaches 10^8 units per
 * second inside a second. Correcting position where contacts correct theirs
 * keeps the velocity constraint honest — it only ever removes relative motion.
 */
const JOINT_CORRECTION = 0.2;
/** Cap on one step's correction, so a badly stretched joint eases back. */
const MAX_JOINT_CORRECTION = 8;
/**
 * How many times the joint position pass runs per step.
 *
 * One pass removes a fifth of the error, which a swinging chain re-introduces
 * as fast: struck side-on, a seven-link rope sat 1.5% long and stayed there.
 * Measured residual after ten seconds of swinging — 1 pass 1.5%, 2 passes
 * 0.8%, 4 passes 0.23%, 8 passes nothing measurable — against a cost for 200
 * joints of 0.132, 0.146, 0.164 and 0.192 ms a step. Four buys the part worth
 * having.
 */
const JOINT_POSITION_PASSES = 4;

/** An anchor in world space. A joint pinned to the world stores one already. */
function jointAnchor(body: InternalBody | null, lx: number, ly: number, out: MutablePoint): void {
  if (body === null) {
    out.x = lx;
    out.y = ly;
    return;
  }
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  out.x = body.x + c * lx - s * ly;
  out.y = body.y + s * lx + c * ly;
}

function pointVelocityX(body: InternalBody | null, ry: number): number {
  return body === null ? 0 : body.vx - body.omega * ry;
}

function pointVelocityY(body: InternalBody | null, rx: number): number {
  return body === null ? 0 : body.vy + body.omega * rx;
}

function applyJointImpulse(
  body: InternalBody | null,
  ix: number,
  iy: number,
  px: number,
  py: number,
): void {
  if (body === null) return;
  applyImpulseOn(body, ix, iy, px, py);
}

const JOINT_A: MutablePoint = { x: 0, y: 0 };
const JOINT_B: MutablePoint = { x: 0, y: 0 };

function warmStartJoint(joint: InternalJoint): void {
  jointAnchor(joint.a, joint.anchorAX, joint.anchorAY, JOINT_A);
  jointAnchor(joint.b, joint.anchorBX, joint.anchorBY, JOINT_B);

  let ix: number;
  let iy: number;
  if (joint.kind === JointKind.Distance) {
    if (joint.impulse === 0) return;
    // Rebuilt along the axis the joint has now, not the one it had then.
    const nx = JOINT_B.x - JOINT_A.x;
    const ny = JOINT_B.y - JOINT_A.y;
    const separation = Math.hypot(nx, ny);
    if (separation === 0) return;
    ix = (nx / separation) * joint.impulse;
    iy = (ny / separation) * joint.impulse;
  } else {
    if (joint.impulseX === 0 && joint.impulseY === 0) return;
    ix = joint.impulseX;
    iy = joint.impulseY;
  }
  applyJointImpulse(joint.a, -ix, -iy, JOINT_A.x, JOINT_A.y);
  applyJointImpulse(joint.b, ix, iy, JOINT_B.x, JOINT_B.y);
}

function solveDistanceJoint(joint: InternalJoint): void {
  const { a, b } = joint;
  jointAnchor(a, joint.anchorAX, joint.anchorAY, JOINT_A);
  jointAnchor(b, joint.anchorBX, joint.anchorBY, JOINT_B);

  let nx = JOINT_B.x - JOINT_A.x;
  let ny = JOINT_B.y - JOINT_A.y;
  const separation = Math.hypot(nx, ny);
  // Coincident anchors leave no direction to pull along; the next step, once
  // anything has moved them apart, has one.
  if (separation === 0) return;
  nx /= separation;
  ny /= separation;

  const rax = JOINT_A.x - a.x;
  const ray = JOINT_A.y - a.y;
  const rbx = b === null ? 0 : JOINT_B.x - b.x;
  const rby = b === null ? 0 : JOINT_B.y - b.y;

  const dvx = pointVelocityX(b, rby) - pointVelocityX(a, ray);
  const dvy = pointVelocityY(b, rbx) - pointVelocityY(a, rax);
  const vn = dvx * nx + dvy * ny;

  const rnA = cross2(rax, ray, nx, ny);
  const rnB = cross2(rbx, rby, nx, ny);
  const invMass =
    a.invMass +
    (b === null ? 0 : b.invMass) +
    a.invInertia * rnA * rnA +
    (b === null ? 0 : b.invInertia * rnB * rnB);
  if (invMass === 0) return;

  const lambda = -vn / invMass;
  joint.impulse += lambda;
  applyJointImpulse(a, -nx * lambda, -ny * lambda, JOINT_A.x, JOINT_A.y);
  applyJointImpulse(b, nx * lambda, ny * lambda, JOINT_B.x, JOINT_B.y);
}

function solvePinJoint(joint: InternalJoint): void {
  const { a, b } = joint;
  jointAnchor(a, joint.anchorAX, joint.anchorAY, JOINT_A);
  jointAnchor(b, joint.anchorBX, joint.anchorBY, JOINT_B);

  const rax = JOINT_A.x - a.x;
  const ray = JOINT_A.y - a.y;
  const rbx = b === null ? 0 : JOINT_B.x - b.x;
  const rby = b === null ? 0 : JOINT_B.y - b.y;

  const dvx = pointVelocityX(b, rby) - pointVelocityX(a, ray);
  const dvy = pointVelocityY(b, rbx) - pointVelocityY(a, rax);

  // Holding a point still is two constraints at once, so the effective mass is
  // a 2x2 rather than a scalar — solving each axis on its own would let the
  // other undo it every iteration.
  const invMassSum = a.invMass + (b === null ? 0 : b.invMass);
  const iA = a.invInertia;
  const iB = b === null ? 0 : b.invInertia;
  const k11 = invMassSum + iA * ray * ray + iB * rby * rby;
  const k12 = -iA * rax * ray - iB * rbx * rby;
  const k22 = invMassSum + iA * rax * rax + iB * rbx * rbx;
  const determinant = k11 * k22 - k12 * k12;
  if (determinant === 0) return;

  const rhsX = -dvx;
  const rhsY = -dvy;
  const lambdaX = (k22 * rhsX - k12 * rhsY) / determinant;
  const lambdaY = (k11 * rhsY - k12 * rhsX) / determinant;

  joint.impulseX += lambdaX;
  joint.impulseY += lambdaY;
  applyJointImpulse(a, -lambdaX, -lambdaY, JOINT_A.x, JOINT_A.y);
  applyJointImpulse(b, lambdaX, lambdaY, JOINT_B.x, JOINT_B.y);
}

export class PhysicsWorld implements World {
  gravityX: number;
  gravityY: number;
  iterations: number;
  linearDamping: number;
  angularDamping: number;
  #bodies: InternalBody[] = [];
  #contacts: Contact[] = [];
  #sorted: InternalBody[] = [];
  #joints: InternalJoint[] = [];
  #previous: Contact[] = [];
  #previousCount = 0;

  constructor(options: WorldOptions = {}) {
    this.gravityX = finite(options.gravityX ?? 0, "gravityX");
    this.gravityY = finite(options.gravityY ?? 980, "gravityY");
    this.iterations = Math.max(
      1,
      Math.floor(finite(options.iterations ?? DEFAULT_ITERATIONS, "iterations")),
    );
    this.linearDamping = nonNegative(options.linearDamping ?? 0, "linearDamping");
    this.angularDamping = nonNegative(options.angularDamping ?? 0, "angularDamping");
  }

  get bodies(): readonly RigidBody[] {
    return this.#bodies;
  }

  addCircle(options: CircleBodyOptions): RigidBody {
    const radius = positive(options.radius, "radius");
    const area = Math.PI * radius * radius;
    const mass = massProperties(area, 0.5 * radius * radius, options);
    const body = createBody(Shape.Circle, options, this, { radius, ...mass });
    this.#bodies.push(body);
    return body;
  }

  addBox(options: BoxBodyOptions): RigidBody {
    const width = positive(options.width, "width");
    const height = positive(options.height, "height");
    const area = width * height;
    const mass = massProperties(area, (width * width + height * height) / 12, options);
    const body = createBody(Shape.Box, options, this, { width, height, ...mass });
    this.#bodies.push(body);
    return body;
  }

  remove(body: RigidBody): boolean {
    const index = this.#bodies.indexOf(body as InternalBody);
    if (index === -1) return false;
    const removed = this.#bodies[index] as InternalBody;
    this.#bodies.splice(index, 1);
    // A joint to a body the world no longer owns would keep solving against a
    // ghost, so it goes with it.
    for (let i = this.#joints.length - 1; i >= 0; i--) {
      const joint = this.#joints[i];
      if (joint === undefined) continue;
      if (joint.a === removed || joint.b === removed) this.removeJoint(joint);
    }
    // Whatever was resting on it has just lost its support, and a sleeping
    // body has no other way to find that out.
    updateBounds(removed, 0);
    for (const other of this.#bodies) {
      if (other.isAwake) continue;
      updateBounds(other, 0);
      const apart =
        removed.maxX < other.minX - WAKE_MARGIN ||
        other.maxX < removed.minX - WAKE_MARGIN ||
        removed.maxY < other.minY - WAKE_MARGIN ||
        other.maxY < removed.minY - WAKE_MARGIN;
      if (!apart) wakeBody(other);
    }
    this.#previousCount = 0;
    return true;
  }

  wake(body: RigidBody): void {
    wakeBody(this.#owned(body));
  }

  get joints(): readonly Joint[] {
    return this.#joints;
  }

  addDistanceJoint(options: DistanceJointOptions): Joint {
    const joint = this.#createJoint(JointKind.Distance, options);
    if (options.length !== undefined) {
      joint.length = nonNegative(options.length, "length");
    } else {
      jointAnchor(joint.a, joint.anchorAX, joint.anchorAY, JOINT_A);
      jointAnchor(joint.b, joint.anchorBX, joint.anchorBY, JOINT_B);
      joint.length = Math.hypot(JOINT_B.x - JOINT_A.x, JOINT_B.y - JOINT_A.y);
    }
    this.#joints.push(joint);
    return joint;
  }

  addPinJoint(options: JointOptions): Joint {
    const joint = this.#createJoint(JointKind.Pin, options);
    this.#joints.push(joint);
    return joint;
  }

  removeJoint(joint: Joint): boolean {
    const index = this.#joints.indexOf(joint as InternalJoint);
    if (index === -1) return false;
    this.#joints.splice(index, 1);
    // Whatever it was holding up is now on its own.
    wakeBody(joint.a as InternalBody);
    if (joint.b !== null) wakeBody(joint.b as InternalBody);
    return true;
  }

  #createJoint(kind: JointKind, options: JointOptions): InternalJoint {
    const a = this.#owned(options.a);
    const b = options.b === undefined ? null : this.#owned(options.b);
    if (a === b) throw new TypeError("A joint needs two different bodies");
    return {
      kind,
      a,
      b,
      anchorAX: finite(options.anchorAX ?? 0, "anchorAX"),
      anchorAY: finite(options.anchorAY ?? 0, "anchorAY"),
      anchorBX: finite(options.anchorBX ?? (b === null ? a.x : 0), "anchorBX"),
      anchorBY: finite(options.anchorBY ?? (b === null ? a.y : 0), "anchorBY"),
      length: 0,
      impulse: 0,
      impulseX: 0,
      impulseY: 0,
    };
  }

  raycast(
    x: number,
    y: number,
    dx: number,
    dy: number,
    options: RaycastOptions = {},
  ): RigidBody | null {
    const length = Math.hypot(dx, dy);
    if (length === 0) return null;
    const ux = dx / length;
    const uy = dy / length;
    const maxDistance = options.maxDistance ?? Infinity;
    if (!(maxDistance >= 0)) return null;

    let best: InternalBody | null = null;
    let bestDistance = maxDistance;
    let bestNx = 0;
    let bestNy = 0;

    for (const body of this.#bodies) {
      if (body === options.ignore) continue;
      let distance: number;
      if (body.shape === Shape.Circle) {
        distance = rayCircle(x, y, ux, uy, body.x, body.y, body.radius);
        if (distance >= 0 && distance <= bestDistance) {
          const px = x + ux * distance;
          const py = y + uy * distance;
          // Zero radius is impossible, so this normal is always defined.
          RAY_NORMAL.x = (px - body.x) / body.radius;
          RAY_NORMAL.y = (py - body.y) / body.radius;
        }
      } else {
        distance = rayBox(x, y, ux, uy, body, RAY_NORMAL);
      }
      if (distance < 0 || distance > bestDistance) continue;
      best = body;
      bestDistance = distance;
      bestNx = RAY_NORMAL.x;
      bestNy = RAY_NORMAL.y;
    }

    if (best === null) return null;
    const out = options.out;
    if (out !== undefined) {
      out.x = x + ux * bestDistance;
      out.y = y + uy * bestDistance;
      out.normalX = bestNx;
      out.normalY = bestNy;
      out.distance = bestDistance;
    }
    return best;
  }

  pointQuery(x: number, y: number): RigidBody | null {
    // Backwards, so the body drawn last is the one picked up.
    for (let i = this.#bodies.length - 1; i >= 0; i--) {
      const body = this.#bodies[i];
      if (body !== undefined && containsPoint(body, x, y)) return body;
    }
    return null;
  }

  clear(): void {
    this.#bodies.length = 0;
    this.#joints.length = 0;
    this.#previousCount = 0;
  }

  applyForce(body: RigidBody, fx: number, fy: number, px?: number, py?: number): void {
    const target = this.#owned(body);
    wakeBody(target);
    applyForceOn(
      target,
      finite(fx, "fx"),
      finite(fy, "fy"),
      finite(px ?? body.x, "px"),
      finite(py ?? body.y, "py"),
    );
  }

  applyImpulse(body: RigidBody, ix: number, iy: number, px?: number, py?: number): void {
    const target = this.#owned(body);
    wakeBody(target);
    applyImpulseOn(
      target,
      finite(ix, "ix"),
      finite(iy, "iy"),
      finite(px ?? body.x, "px"),
      finite(py ?? body.y, "py"),
    );
  }

  #owned(body: RigidBody): InternalBody {
    const internal = body as InternalBody;
    if (this.#bodies.indexOf(internal) === -1) {
      throw new TypeError("This body does not belong to this world");
    }
    return internal;
  }

  /**
   * Advance the world.
   *
   * The order is the whole reason contacts hold: collide first, on the
   * positions and velocities this step inherited, then integrate velocities,
   * then let the solver spend those velocities, and only then move anything.
   * Detecting after the move instead leaves the solver correcting a frame that
   * has already been drawn, which is what a stack falling over looks like.
   */
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const bodies = this.#bodies;

    // A joint reaches a body a contact never would, so a sleeper on the far
    // end of one has to be woken before the pair test decides anything.
    for (const joint of this.#joints) {
      const other = joint.b;
      if (other === null) continue;
      if (joint.a.isAwake !== other.isAwake) {
        wakeBody(joint.a);
        wakeBody(other);
      }
    }

    const count = findContacts(bodies, this.#sorted, this.#contacts, dt);
    // Captured before gravity is added, so a resting body does not read this
    // step's downward nudge as an impact and bounce on it.
    for (let i = 0; i < count; i++) {
      const contact = this.#contacts[i];
      if (contact !== undefined) contact.approach = relativeNormalSpeed(contact);
    }

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body === undefined || body.invMass === 0 || !body.isAwake) continue;
      body.vx += (this.gravityX + body.fx * body.invMass) * dt;
      body.vy += (this.gravityY + body.fy * body.invMass) * dt;
      body.omega += body.torque * body.invInertia * dt;
      // Implicit rather than `v *= 1 - damping * dt`, which goes negative and
      // flings the body backwards once the step is long enough.
      if (body.linearDamping > 0) {
        const scale = 1 / (1 + dt * body.linearDamping);
        body.vx *= scale;
        body.vy *= scale;
      }
      if (body.angularDamping > 0) body.omega /= 1 + dt * body.angularDamping;
      body.fx = 0;
      body.fy = 0;
      body.torque = 0;
    }

    matchWarmStart(this.#contacts, count, this.#previous, this.#previousCount);
    for (let i = 0; i < count; i++) {
      const contact = this.#contacts[i];
      if (contact === undefined) continue;
      applyWarmStart(contact);
      // A contact found before the shapes touch carries the gap as a negative
      // depth. Letting the pair close exactly that much and no more is what
      // makes the constraint stop a body at the surface instead of behind it.
      const gap = Math.max(-contact.depth, 0);
      const vn = contact.approach;
      const meetsThisStep = -vn * dt >= gap;
      const e = Math.min(contact.a.restitution, contact.b.restitution);
      const bounce = meetsThisStep && vn < -RESTITUTION_THRESHOLD ? -e * vn : 0;
      contact.velocityBias = bounce > 0 ? bounce : -gap / dt;
    }
    for (const joint of this.#joints) warmStartJoint(joint);

    for (let iter = 0; iter < this.iterations; iter++) {
      for (let i = 0; i < count; i++) {
        const contact = this.#contacts[i];
        if (contact !== undefined) solveContact(contact);
      }
      for (const joint of this.#joints) {
        if (joint.kind === JointKind.Distance) solveDistanceJoint(joint);
        else solvePinJoint(joint);
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body === undefined || body.invMass === 0 || !body.isAwake) continue;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.angle += body.omega * dt;
    }
    for (let i = 0; i < count; i++) {
      const contact = this.#contacts[i];
      if (contact !== undefined) correctPositions(contact);
    }
    for (let pass = 0; pass < JOINT_POSITION_PASSES; pass++) {
      for (const joint of this.#joints) correctJoint(joint);
    }
    this.#settle(dt, count);
    const swap = this.#previous;
    this.#previous = this.#contacts;
    this.#contacts = swap;
    this.#previousCount = count;
  }

  /**
   * Put whole islands of still bodies to sleep.
   *
   * Islands rather than bodies, because a crate at the bottom of a stack is
   * perfectly still while the one on top is still rocking — sleeping it alone
   * would leave the stack resting on something the solver no longer moves,
   * and the pile would settle into itself. An island is only as still as its
   * most restless member.
   */
  #settle(dt: number, count: number): void {
    const bodies = this.#bodies;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body === undefined) continue;
      body.index = i;
      body.island = i;
      body.islandStill = Infinity;
      if (body.invMass === 0 || !body.isAwake) continue;
      const still =
        Math.abs(body.vx) + Math.abs(body.vy) < SLEEP_LINEAR_SPEED &&
        Math.abs(body.omega) < SLEEP_ANGULAR_SPEED;
      body.stillFor = still ? body.stillFor + dt : 0;
    }

    for (let i = 0; i < count; i++) {
      const contact = this.#contacts[i];
      if (contact === undefined) continue;
      // Static bodies join no island: a floor everything rests on would
      // otherwise chain every pile in the world into one.
      if (contact.a.invMass === 0 || contact.b.invMass === 0) continue;
      joinIslands(bodies, contact.a.index, contact.b.index);
    }

    for (const joint of this.#joints) {
      const other = joint.b;
      if (other === null || joint.a.invMass === 0 || other.invMass === 0) continue;
      joinIslands(bodies, joint.a.index, other.index);
    }

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body === undefined || body.invMass === 0 || !body.isAwake) continue;
      const root = bodies[islandRoot(bodies, i)];
      if (root !== undefined && body.stillFor < root.islandStill) {
        root.islandStill = body.stillFor;
      }
    }

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body === undefined || body.invMass === 0 || !body.isAwake) continue;
      const root = bodies[islandRoot(bodies, i)];
      if (root === undefined || root.islandStill < SLEEP_DELAY) continue;
      body.isAwake = false;
      body.vx = 0;
      body.vy = 0;
      body.omega = 0;
    }
  }
}

export function world(options: WorldOptions = {}): World {
  return new PhysicsWorld(options);
}
