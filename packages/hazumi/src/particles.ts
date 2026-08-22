import { parse, toSrgb } from "@hazumi/color";
import { type Rng } from "@hazumi/math";
import { getActiveContext } from "./active-context";
import type { ColorLike, Rgba } from "./color-cache";

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
  readonly x: number;
  readonly y: number;
  /** How many to spawn. Defaults to 1. Extra particles are dropped if the pool is full. */
  readonly count?: number;
  readonly speed?: ParticleRange;
  /** Radians. Defaults to a full turn. */
  readonly angle?: ParticleRange;
  readonly life?: ParticleRange;
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

function toRgba(color: ColorLike | undefined, fallback: Rgba): Rgba {
  if (color === undefined) return fallback;
  const oklch = typeof color === "string" ? parse(color) : color;
  const rgb = toSrgb(oklch);
  return [rgb.r, rgb.g, rgb.b, rgb.alpha];
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
      const start = toRgba(burst.color, [1, 1, 1, 1]);
      const end = toRgba(burst.endColor, [start[0], start[1], start[2], 0]);
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
        slot.x = burst.x;
        slot.y = burst.y;
        slot.vx = Math.cos(angle) * speed;
        slot.vy = Math.sin(angle) * speed;
        slot.life = life;
        slot.maxLife = life;
        slot.t = 0;
        slot.size0 = size0;
        slot.size1 = size1;
        slot.size = size0;
        slot.r0 = start[0];
        slot.g0 = start[1];
        slot.b0 = start[2];
        slot.a0 = start[3];
        slot.r1 = end[0];
        slot.g1 = end[1];
        slot.b1 = end[2];
        slot.a1 = end[3];
        slot.r = start[0];
        slot.g = start[1];
        slot.b = start[2];
        slot.a = start[3];
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
      for (let i = 0; i < count; i++) {
        const slot = slots[i] as Slot;
        ctx.fillRgba(slot.r, slot.g, slot.b, slot.a);
        ctx.circle(slot.x, slot.y, slot.size);
      }
      ctx.pop();
    },
    clear: (): void => {
      count = 0;
    },
  };
}
