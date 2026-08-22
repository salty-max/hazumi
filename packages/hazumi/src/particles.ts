import { type Rng } from "@hazumi/math";
import { getActiveContext } from "./active-context";
import { ColorCache, type ColorLike } from "./color-cache";

/** A number, or a closed interval sampled uniformly at emit time. */
export type ParticleRange = number | readonly [number, number];

/**
 * One live particle. The object is reused when the particle dies — do not
 * keep a reference across frames.
 */
export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: number;
  readonly life: number;
  readonly maxLife: number;
  /** Age in 0–1, 0 at emit, 1 at death. */
  readonly t: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ParticleBurst {
  /** Origin. A range sprays across a segment. */
  readonly x: ParticleRange;
  readonly y: ParticleRange;
  /** How many to spawn. Defaults to 1. Extra particles are dropped if the pool is full. */
  readonly count?: number;
  readonly speed?: ParticleRange;
  /** Radians. Defaults to a full turn. */
  readonly angle?: ParticleRange;
  /**
   * Added after the polar `speed`/`angle` so a burst can inherit a body's
   * velocity: `vx: player.vx`, `angle` for the spray.
   */
  readonly vx?: ParticleRange;
  readonly vy?: ParticleRange;
  readonly life?: ParticleRange;
  /** Diameter, same as `circle()`. */
  readonly size?: ParticleRange;
  /** Defaults to `size`. */
  readonly endSize?: ParticleRange;
  readonly color?: ColorLike;
  /**
   * Defaults to the same RGB as `color` with alpha 0, so particles fade out
   * unless you pass an explicit end colour.
   */
  readonly endColor?: ColorLike;
}

export interface ParticleGravity {
  readonly x?: number;
  readonly y?: number;
}

export interface ParticleSystemOptions {
  /** Maximum live particles. Preallocated. */
  readonly capacity: number;
  readonly gravity?: ParticleGravity;
  /** Velocity decay per second. 0 is no drag. */
  readonly drag?: number;
  /**
   * Defaults to the active scene's seeded generator, so a burst is
   * reproducible. Pass one in tests that have no scene.
   */
  readonly random?: Rng;
}

export interface ParticleSystem {
  readonly capacity: number;
  /** Currently alive. */
  readonly count: number;
  emit: (burst: ParticleBurst) => void;
  update: (dt: number) => void;
  /**
   * Draw every live particle. The default paints a filled circle. A custom
   * `paint` is called once per particle; the particle object is reused, so
   * copy values you need later.
   */
  draw: (paint?: (particle: Particle) => void) => void;
  clear: () => void;
}

interface Slot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  size0: number;
  size1: number;
  life: number;
  maxLife: number;
  t: number;
  r: number;
  g: number;
  b: number;
  a: number;
  r0: number;
  g0: number;
  b0: number;
  a0: number;
  r1: number;
  g1: number;
  b1: number;
  a1: number;
}

function sample(rng: Rng, value: ParticleRange | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") return value;
  const lo = value[0] as number;
  const hi = value[1] as number;
  return rng.range(lo, hi);
}

const OPAQUE_WHITE: readonly [number, number, number, number] = [1, 1, 1, 1];

function writeColor(
  cache: ColorCache,
  color: ColorLike | undefined,
  into: [number, number, number, number],
  fallback: readonly [number, number, number, number],
): void {
  if (color === undefined) {
    into[0] = fallback[0];
    into[1] = fallback[1];
    into[2] = fallback[2];
    into[3] = fallback[3];
    return;
  }
  const [r, g, b, a] = cache.resolve(color);
  into[0] = r;
  into[1] = g;
  into[2] = b;
  into[3] = a;
}

function rngForEmit(explicit: Rng | undefined): Rng {
  if (explicit !== undefined) return explicit;
  return getActiveContext().random;
}

/**
 * A pooled particle system.
 *
 * The pool is allocated once. `emit` / `update` / `draw` do not allocate after
 * that, which is the property the per-frame path depends on. Particles are
 * circles (or whatever `paint` draws) — the command buffer never sees a
 * tessellated sprite.
 */
export function particles(options: ParticleSystemOptions): ParticleSystem {
  const capacity = options.capacity;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error("particles() capacity must be a positive integer");
  }

  const gravityX = options.gravity?.x ?? 0;
  const gravityY = options.gravity?.y ?? 0;
  const drag = options.drag ?? 0;
  const rngOption = options.random;
  const colors = new ColorCache();
  const startCol: [number, number, number, number] = [1, 1, 1, 1];
  const endCol: [number, number, number, number] = [1, 1, 1, 0];

  const slots: Slot[] = [];
  for (let i = 0; i < capacity; i++) {
    slots.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      size0: 0,
      size1: 0,
      life: 0,
      maxLife: 1,
      t: 0,
      r: 1,
      g: 1,
      b: 1,
      a: 1,
      r0: 1,
      g0: 1,
      b0: 1,
      a0: 1,
      r1: 1,
      g1: 1,
      b1: 1,
      a1: 0,
    });
  }

  let count = 0;

  const kill = (index: number): void => {
    count -= 1;
    if (index === count) return;
    const dead = slots[index] as Slot;
    slots[index] = slots[count] as Slot;
    slots[count] = dead;
  };

  return {
    capacity,
    get count(): number {
      return count;
    },
    emit: (burst: ParticleBurst): void => {
      const rng = rngForEmit(rngOption);
      const n = Math.max(0, Math.trunc(burst.count ?? 1));
      writeColor(colors, burst.color, startCol, OPAQUE_WHITE);
      if (burst.endColor === undefined) {
        endCol[0] = startCol[0];
        endCol[1] = startCol[1];
        endCol[2] = startCol[2];
        endCol[3] = 0;
      } else {
        writeColor(colors, burst.endColor, endCol, startCol);
      }
      for (let i = 0; i < n; i++) {
        if (count >= capacity) return;
        const slot = slots[count] as Slot;
        count += 1;
        const speed = sample(rng, burst.speed, 0);
        const angle =
          burst.angle === undefined ? rng.range(0, Math.PI * 2) : sample(rng, burst.angle, 0);
        const life = Math.max(1e-6, sample(rng, burst.life, 1));
        const size0 = Math.max(0, sample(rng, burst.size, 8));
        const size1 = Math.max(0, sample(rng, burst.endSize, size0));
        slot.x = sample(rng, burst.x, 0);
        slot.y = sample(rng, burst.y, 0);
        slot.vx = Math.cos(angle) * speed + sample(rng, burst.vx, 0);
        slot.vy = Math.sin(angle) * speed + sample(rng, burst.vy, 0);
        slot.life = life;
        slot.maxLife = life;
        slot.t = 0;
        slot.size0 = size0;
        slot.size1 = size1;
        slot.size = size0;
        slot.r0 = startCol[0];
        slot.g0 = startCol[1];
        slot.b0 = startCol[2];
        slot.a0 = startCol[3];
        slot.r1 = endCol[0];
        slot.g1 = endCol[1];
        slot.b1 = endCol[2];
        slot.a1 = endCol[3];
        slot.r = startCol[0];
        slot.g = startCol[1];
        slot.b = startCol[2];
        slot.a = startCol[3];
      }
    },
    update: (dt: number): void => {
      const damp = drag === 0 ? 1 : Math.max(0, 1 - drag * dt);
      for (let i = count - 1; i >= 0; i--) {
        const slot = slots[i] as Slot;
        slot.life -= dt;
        if (slot.life <= 0) {
          kill(i);
          continue;
        }
        const t = 1 - slot.life / slot.maxLife;
        slot.t = t;
        slot.vx = (slot.vx + gravityX * dt) * damp;
        slot.vy = (slot.vy + gravityY * dt) * damp;
        slot.x += slot.vx * dt;
        slot.y += slot.vy * dt;
        slot.size = slot.size0 + (slot.size1 - slot.size0) * t;
        slot.r = slot.r0 + (slot.r1 - slot.r0) * t;
        slot.g = slot.g0 + (slot.g1 - slot.g0) * t;
        slot.b = slot.b0 + (slot.b1 - slot.b0) * t;
        slot.a = slot.a0 + (slot.a1 - slot.a0) * t;
      }
    },
    draw: (paint?: (particle: Particle) => void): void => {
      if (paint !== undefined) {
        for (let i = 0; i < count; i++) paint(slots[i] as Particle);
        return;
      }
      const ctx = getActiveContext();
      ctx.push();
      ctx.noStroke();
      let lastR = NaN;
      let lastG = NaN;
      let lastB = NaN;
      let lastA = NaN;
      for (let i = 0; i < count; i++) {
        const slot = slots[i] as Slot;
        if (slot.r !== lastR || slot.g !== lastG || slot.b !== lastB || slot.a !== lastA) {
          ctx.fillRgba(slot.r, slot.g, slot.b, slot.a);
          lastR = slot.r;
          lastG = slot.g;
          lastB = slot.b;
          lastA = slot.a;
        }
        ctx.circle(slot.x, slot.y, slot.size);
      }
      ctx.pop();
    },
    clear: (): void => {
      count = 0;
    },
  };
}
