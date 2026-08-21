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
  readonly shape: Shape;
  readonly radius: number;
  readonly width: number;
  readonly height: number;
  readonly mass: number;
  readonly invMass: number;
  readonly inertia: number;
  readonly invInertia: number;
  readonly isStatic: boolean;
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
}

export interface World {
  gravityX: number;
  gravityY: number;
  iterations: number;
  readonly bodies: readonly RigidBody[];
  addCircle: (options: CircleBodyOptions) => RigidBody;
  addBox: (options: BoxBodyOptions) => RigidBody;
  remove: (body: RigidBody) => boolean;
  clear: () => void;
  applyForce: (body: RigidBody, fx: number, fy: number, px?: number, py?: number) => void;
  applyImpulse: (body: RigidBody, ix: number, iy: number, px?: number, py?: number) => void;
  step: (dt: number) => void;
}

interface InternalBody extends RigidBody {
  fx: number;
  fy: number;
  torque: number;
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
const MAX_CONTACTS = 4096;

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

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
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
    shape,
    radius: 0,
    width: 0,
    height: 0,
    mass: 0,
    invMass: 0,
    inertia: 0,
    invInertia: 0,
    isStatic: options.isStatic === true,
    fx: 0,
    fy: 0,
    torque: 0,
    ...extra,
  };
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

function boundsOverlap(a: InternalBody, b: InternalBody, padding: number): boolean {
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
  return Math.abs(a.x - b.x) <= aHw + bHw + padding && Math.abs(a.y - b.y) <= aHh + bHh + padding;
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
): number {
  if (depth < 0 || count >= MAX_CONTACTS) return count;
  let contact = contacts[count];
  if (contact === undefined) {
    contact = { a, b, nx, ny, px, py, depth, pn: 0, pt: 0, velocityBias: 0 };
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
  }
  return count + 1;
}

function collideCircles(
  a: InternalBody,
  b: InternalBody,
  contacts: Contact[],
  count: number,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const span = a.radius + b.radius;
  if (distSq > span * span) return count;
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
  return addContact(contacts, count, a, b, nx, ny, px, py, span - dist);
}

function collideCircleBox(
  circle: InternalBody,
  box: InternalBody,
  circleIsA: boolean,
  contacts: Contact[],
  count: number,
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
    if (distSq > circle.radius * circle.radius) return count;
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
  return addContact(contacts, count, a, b, nx, ny, px, py, depth);
}

interface BoxAxes {
  c: number;
  s: number;
  hw: number;
  hh: number;
}

function boxAxes(body: InternalBody): BoxAxes {
  return {
    c: Math.cos(body.angle),
    s: Math.sin(body.angle),
    hw: body.width * 0.5,
    hh: body.height * 0.5,
  };
}

function projectBox(
  body: InternalBody,
  axes: BoxAxes,
  ax: number,
  ay: number,
): readonly [number, number] {
  const extent =
    Math.abs(axes.c * ax + axes.s * ay) * axes.hw + Math.abs(-axes.s * ax + axes.c * ay) * axes.hh;
  const mid = body.x * ax + body.y * ay;
  return [mid - extent, mid + extent];
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
  const dots = [
    axes.c * nx + axes.s * ny,
    -axes.s * nx + axes.c * ny,
    -axes.c * nx - axes.s * ny,
    axes.s * nx - axes.c * ny,
  ];
  let best = 0;
  let bestDot = dots[0] as number;
  for (let i = 1; i < 4; i++) {
    const dot = dots[i] as number;
    if (dot < bestDot) {
      best = i;
      bestDot = dot;
    }
  }
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

function collideBoxes(
  a: InternalBody,
  b: InternalBody,
  contacts: Contact[],
  count: number,
): number {
  const axesA = boxAxes(a);
  const axesB = boxAxes(b);
  const worldAxes: readonly (readonly [number, number])[] = [
    [axesA.c, axesA.s],
    [-axesA.s, axesA.c],
    [axesB.c, axesB.s],
    [-axesB.s, axesB.c],
  ];

  let minOverlap = Infinity;
  let nx = 1;
  let ny = 0;
  let axisIndex = 0;

  for (let i = 0; i < worldAxes.length; i++) {
    const axis = worldAxes[i];
    if (axis === undefined) continue;
    let ax = axis[0];
    let ay = axis[1];
    const [minA, maxA] = projectBox(a, axesA, ax, ay);
    const [minB, maxB] = projectBox(b, axesB, ax, ay);
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap < 0) return count;
    if ((b.x - a.x) * ax + (b.y - a.y) * ay < 0) {
      ax = -ax;
      ay = -ay;
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
      nx = ax;
      ny = ay;
      axisIndex = i;
    }
  }

  const refIsA = axisIndex < 2;
  const ref = refIsA ? a : b;
  const inc = refIsA ? b : a;
  const refAxes = refIsA ? axesA : axesB;
  const incAxes = refIsA ? axesB : axesA;
  const frontX = refIsA ? nx : -nx;
  const frontY = refIsA ? ny : -ny;
  const sideX = -frontY;
  const sideY = frontX;

  incidentFace(inc, incAxes, frontX, frontY, CLIP_IN[0], CLIP_IN[1]);

  const v0 = CLIP_OUT[0] as MutablePoint;
  const v1 = CLIP_OUT[1] as MutablePoint;
  const hw = refAxes.hw;
  const hh = refAxes.hh;
  const localFrontX = refAxes.c * frontX + refAxes.s * frontY;
  const localFrontY = -refAxes.s * frontX + refAxes.c * frontY;
  if (Math.abs(localFrontX) >= Math.abs(localFrontY)) {
    const x = localFrontX >= 0 ? hw : -hw;
    worldPoint(ref, refAxes, x, hh, v0);
    worldPoint(ref, refAxes, x, -hh, v1);
  } else {
    const y = localFrontY >= 0 ? hh : -hh;
    worldPoint(ref, refAxes, hw, y, v0);
    worldPoint(ref, refAxes, -hw, y, v1);
  }
  if (sideX * v0.x + sideY * v0.y > sideX * v1.x + sideY * v1.y) {
    const sx = v0.x;
    const sy = v0.y;
    v0.x = v1.x;
    v0.y = v1.y;
    v1.x = sx;
    v1.y = sy;
  }

  const frontOffset = frontX * v0.x + frontY * v0.y;
  const negSide = -(sideX * v0.x + sideY * v0.y);
  const posSide = sideX * v1.x + sideY * v1.y;

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
    if (separation > PENETRATION_SLOP) continue;
    added = addContact(contacts, added, a, b, nx, ny, p.x, p.y, Math.max(-separation, 0));
  }
  if (added !== count) return added;

  const incident = CLIP_IN[0];
  return addContact(contacts, count, a, b, nx, ny, incident.x, incident.y, minOverlap);
}

function findContacts(bodies: readonly InternalBody[], contacts: Contact[]): number {
  let count = 0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (b === undefined) continue;
      if (a.invMass === 0 && b.invMass === 0) continue;
      if (!boundsOverlap(a, b, 0)) continue;
      if (a.shape === Shape.Circle && b.shape === Shape.Circle) {
        count = collideCircles(a, b, contacts, count);
      } else if (a.shape === Shape.Circle && b.shape === Shape.Box) {
        count = collideCircleBox(a, b, true, contacts, count);
      } else if (a.shape === Shape.Box && b.shape === Shape.Circle) {
        count = collideCircleBox(b, a, false, contacts, count);
      } else {
        count = collideBoxes(a, b, contacts, count);
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
  for (let i = 0; i < freshCount; i++) {
    const contact = fresh[i];
    if (contact === undefined) continue;
    let best = -1;
    let bestDist = WARM_START_DISTANCE_SQ;
    for (let j = 0; j < staleCount; j++) {
      const previous = stale[j];
      if (previous === undefined || previous.a !== contact.a || previous.b !== contact.b) continue;
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
  const maxFriction = Math.max(a.friction, b.friction) * contact.pn;
  contact.pt = Math.min(maxFriction, Math.max(-maxFriction, ptOld + tangentLambda));
  tangentLambda = contact.pt - ptOld;
  applyImpulseOn(a, -tx * tangentLambda, -ty * tangentLambda, px, py);
  applyImpulseOn(b, tx * tangentLambda, ty * tangentLambda, px, py);
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
  readonly bodies: InternalBody[];
  #contacts: Contact[] = [];
  #previous: Contact[] = [];
  #previousCount = 0;

  constructor(options: WorldOptions = {}) {
    this.gravityX = finite(options.gravityX ?? 0, "gravityX");
    this.gravityY = finite(options.gravityY ?? 980, "gravityY");
    this.iterations = Math.max(
      1,
      finite(options.iterations ?? DEFAULT_ITERATIONS, "iterations") | 0,
    );
    this.bodies = [];
  }

  addCircle(options: CircleBodyOptions): RigidBody {
    const radius = positive(options.radius, "radius");
    const area = Math.PI * radius * radius;
    const mass = massProperties(area, 0.5 * radius * radius, options);
    const body = createBody(Shape.Circle, options, { radius, ...mass });
    this.bodies.push(body);
    return body;
  }

  addBox(options: BoxBodyOptions): RigidBody {
    const width = positive(options.width, "width");
    const height = positive(options.height, "height");
    const area = width * height;
    const mass = massProperties(area, (width * width + height * height) / 12, options);
    const body = createBody(Shape.Box, options, { width, height, ...mass });
    this.bodies.push(body);
    return body;
  }

  remove(body: RigidBody): boolean {
    const index = this.bodies.indexOf(body as InternalBody);
    if (index === -1) return false;
    this.bodies.splice(index, 1);
    return true;
  }

  clear(): void {
    this.bodies.length = 0;
    this.#previousCount = 0;
  }

  applyForce(body: RigidBody, fx: number, fy: number, px?: number, py?: number): void {
    applyForceOn(
      body as InternalBody,
      finite(fx, "fx"),
      finite(fy, "fy"),
      finite(px ?? body.x, "px"),
      finite(py ?? body.y, "py"),
    );
  }

  applyImpulse(body: RigidBody, ix: number, iy: number, px?: number, py?: number): void {
    applyImpulseOn(
      body as InternalBody,
      finite(ix, "ix"),
      finite(iy, "iy"),
      finite(px ?? body.x, "px"),
      finite(py ?? body.y, "py"),
    );
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body === undefined || body.invMass === 0) continue;
      body.vx += (this.gravityX + body.fx * body.invMass) * dt;
      body.vy += (this.gravityY + body.fy * body.invMass) * dt;
      body.omega += body.torque * body.invInertia * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.angle += body.omega * dt;
      body.fx = 0;
      body.fy = 0;
      body.torque = 0;
    }

    const count = findContacts(bodies, this.#contacts);
    matchWarmStart(this.#contacts, count, this.#previous, this.#previousCount);
    for (let i = 0; i < count; i++) {
      const contact = this.#contacts[i];
      if (contact === undefined) continue;
      applyWarmStart(contact);
      const vn = relativeNormalSpeed(contact);
      const e = Math.min(contact.a.restitution, contact.b.restitution);
      contact.velocityBias = vn < -RESTITUTION_THRESHOLD ? -e * vn : 0;
    }
    for (let iter = 0; iter < this.iterations; iter++) {
      for (let i = 0; i < count; i++) {
        const contact = this.#contacts[i];
        if (contact !== undefined) solveContact(contact);
      }
    }
    for (let i = 0; i < count; i++) {
      const contact = this.#contacts[i];
      if (contact !== undefined) correctPositions(contact);
    }
    const swap = this.#previous;
    this.#previous = this.#contacts;
    this.#contacts = swap;
    this.#previousCount = count;
  }
}

export function world(options: WorldOptions = {}): World {
  return new PhysicsWorld(options);
}
