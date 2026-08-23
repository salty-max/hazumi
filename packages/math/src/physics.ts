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
  /** Union-find parent while sleep is decided. */
  island: number;
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
    island: 0,
    islandStill: 0,
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

function boundsOverlap(a: InternalBody, b: InternalBody, reach: number): boolean {
  let aHw: number;
  let aHh: number;
  if (a.shape === Shape.Circle) {
    aHw = a.radius;
    aHh = a.radius;
  } else {
    const c = Math.abs(Math.cos(a.angle));
    const s = Math.abs(Math.sin(a.angle));
    aHw = c * a.width * 0.5 + s * a.height * 0.5;
    aHh = s * a.width * 0.5 + c * a.height * 0.5;
  }
  let bHw: number;
  let bHh: number;
  if (b.shape === Shape.Circle) {
    bHw = b.radius;
    bHh = b.radius;
  } else {
    const c = Math.abs(Math.cos(b.angle));
    const s = Math.abs(Math.sin(b.angle));
    bHw = c * b.width * 0.5 + s * b.height * 0.5;
    bHh = s * b.width * 0.5 + c * b.height * 0.5;
  }
  return Math.abs(a.x - b.x) <= aHw + bHw + reach && Math.abs(a.y - b.y) <= aHh + bHh + reach;
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

function findContacts(bodies: readonly InternalBody[], contacts: Contact[], dt: number): number {
  let count = 0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (b === undefined) continue;
      // Two bodies that cannot move between them have nothing to resolve. That
      // is what makes a settled pile free rather than merely quiet.
      if (isDormant(a) && isDormant(b)) continue;
      const reach = speculativeReach(a, b, dt);
      if (!boundsOverlap(a, b, reach)) continue;
      // Something that can move has reached a sleeper, so it is no longer
      // entitled to sit the step out.
      if (!a.isAwake) wakeBody(a);
      if (!b.isAwake) wakeBody(b);
      if (a.shape === Shape.Circle && b.shape === Shape.Circle) {
        count = collideCircles(a, b, contacts, count, reach);
      } else if (a.shape === Shape.Circle && b.shape === Shape.Box) {
        count = collideCircleBox(a, b, true, contacts, count, reach);
      } else if (a.shape === Shape.Box && b.shape === Shape.Circle) {
        count = collideCircleBox(b, a, false, contacts, count, reach);
      } else {
        count = collideBoxes(a, b, contacts, count, reach);
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

export class PhysicsWorld implements World {
  gravityX: number;
  gravityY: number;
  iterations: number;
  linearDamping: number;
  angularDamping: number;
  #bodies: InternalBody[] = [];
  #contacts: Contact[] = [];
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
    // Whatever was resting on it has just lost its support, and a sleeping
    // body has no other way to find that out.
    for (const other of this.#bodies) {
      if (!other.isAwake && boundsOverlap(removed, other, WARM_START_DISTANCE_SQ)) wakeBody(other);
    }
    this.#previousCount = 0;
    return true;
  }

  wake(body: RigidBody): void {
    wakeBody(this.#owned(body));
  }

  clear(): void {
    this.#bodies.length = 0;
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

    const count = findContacts(bodies, this.#contacts, dt);
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
    for (let iter = 0; iter < this.iterations; iter++) {
      for (let i = 0; i < count; i++) {
        const contact = this.#contacts[i];
        if (contact !== undefined) solveContact(contact);
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
