import { Blend, type ImageSource } from "@hazumi/graphics";
import { type Rng } from "@hazumi/math";
import { getActiveContext } from "./active-context";
import { ColorCache, type ColorLike } from "./color-cache";
import type { StyleOverrides } from "./context";
import type { SpriteFrame } from "./spritesheet";

/** A number, or a closed interval sampled uniformly at emit time. */
export type ParticleRange = number | readonly [number, number];

/** A whole image or a spritesheet frame. */
export type ParticleImage = ImageSource | SpriteFrame;

/**
 * One live particle. The object is reused when the particle dies — do not
 * keep a reference across frames. `x`/`y`/`angle`/`size` are the values to
 * draw: interpolated when `draw` is given an alpha.
 */
export interface Particle {
  /** Position in world units, interpolated toward the next update. */
  readonly x: number;
  /** Position in world units. */
  readonly y: number;
  /** Velocity, world units per second. */
  readonly vx: number;
  /** Velocity, world units per second. */
  readonly vy: number;
  /** Rotation in radians. */
  readonly angle: number;
  /** Rotation rate, radians per second. */
  readonly spin: number;
  /** Diameter, same as `circle()`. */
  readonly size: number;
  /** Seconds left before it dies. */
  readonly life: number;
  /** Seconds it was given at emit. `t` is the ratio of the two. */
  readonly maxLife: number;
  /** Age in 0–1, 0 at emit, 1 at death. */
  readonly t: number;
  /** Red, 0–1, already interpolated along the burst's colour ramp. */
  readonly r: number;
  /** Green, 0–1. */
  readonly g: number;
  /** Blue, 0–1. */
  readonly b: number;
  /** Opacity, 0–1, with any fade already applied. */
  readonly a: number;
  /** The frame this particle draws, or undefined for a plain circle. */
  readonly image: ParticleImage | undefined;
}

/**
 * One spawn of particles, described by ranges rather than values.
 *
 * Every field that takes a `ParticleRange` may be a single number or a pair to
 * pick between, so a burst is a shape rather than a loop the caller writes.
 */
export interface ParticleBurst {
  /** Origin. A range sprays across a segment. */
  readonly x: ParticleRange;
  /** Origin. A range sprays across a segment. */
  readonly y: ParticleRange;
  /** How many to spawn. Defaults to 1. Extra particles are dropped if the pool is full. */
  readonly count?: number;
  /** Launch speed in world units per second. Defaults to 0. */
  readonly speed?: ParticleRange;
  /** Launch direction in radians. Defaults to a full turn. */
  readonly angle?: ParticleRange;
  /**
   * Added after the polar `speed`/`angle` so a burst can inherit a body's
   * velocity: `vx: player.vx`, `angle` for the spray.
   */
  readonly vx?: ParticleRange;
  /** Added after the polar velocity, like `vx`. */
  readonly vy?: ParticleRange;
  /** Sprite angle in radians. Defaults to the launch direction. */
  readonly rotation?: ParticleRange;
  /** Angular velocity in radians per second. */
  readonly spin?: ParticleRange;
  /** Seconds before death. A range is what stops a burst dying all at once. */
  readonly life?: ParticleRange;
  /** Diameter, same as `circle()`. */
  readonly size?: ParticleRange;
  /** Defaults to `size`. */
  readonly endSize?: ParticleRange;
  /** Colour at emit. Defaults to white. */
  readonly color?: ColorLike;
  /**
   * Defaults to the same RGB as `color` with alpha 0, so particles fade out
   * unless you pass an explicit end colour.
   */
  readonly endColor?: ColorLike;
  /** Overrides the system's default image for this burst. */
  readonly image?: ParticleImage;
}

/**
 * A continuous emission: the same shape as a burst, but per second.
 *
 * Rate rather than count, because a trail spawning `rate * dt` particles a
 * frame must not change density when the frame rate does.
 */
export interface ParticleDrip extends Omit<ParticleBurst, "count"> {
  /** Particles to spawn per second. Fractions accumulate across `update`s. */
  readonly rate: number;
}

/** Constant acceleration applied to every live particle, in units per second squared. */
export interface ParticleGravity {
  /** Horizontal acceleration, world units per second squared. Defaults to 0. */
  readonly x?: number;
  /** Vertical acceleration, positive downwards. Defaults to 0. */
  readonly y?: number;
}

/** How a system is built. `capacity` is the only thing it must be told. */
export interface ParticleSystemOptions {
  /** Maximum live particles. Preallocated. */
  readonly capacity: number;
  /** Constant acceleration on every particle. None by default. */
  readonly gravity?: ParticleGravity;
  /** Velocity decay per second. 0 is no drag. */
  readonly drag?: number;
  /**
   * Blend used by the default draw. Additive is the spark look; pass
   * `Blend.Normal` for dust and debris.
   */
  readonly blend?: Blend;
  /** Drawn when a burst does not pass its own image. Circles if omitted. */
  readonly image?: ParticleImage;
  /**
   * Defaults to the active scene's seeded generator, so a burst is
   * reproducible. Pass one in tests that have no scene.
   */
  readonly random?: Rng;
}

/**
 * A fixed pool of particles: emit into it, step it, draw it.
 *
 * Preallocated and never resized. A burst that would overflow drops its extra
 * particles rather than growing the pool mid-frame, which is the trade that
 * keeps the update allocation-free.
 */
export interface ParticleSystem {
  /** Maximum live particles. Fixed at construction; the pool never grows. */
  readonly capacity: number;
  /** Currently alive. */
  readonly count: number;
  /** Spawn a burst now. Particles past the capacity are dropped, not queued. */
  emit: (burst: ParticleBurst) => void;
  /** Spawn `rate * dt` particles, carrying the fractional remainder. */
  drip: (flow: ParticleDrip, dt: number) => void;
  /** Advance every live particle and retire the expired ones. */
  update: (dt: number) => void;
  /**
   * Draw every live particle. `alpha` interpolates from the previous update,
   * same as a scene `draw(alpha)`. A custom `paint` sees those interpolated
   * values; the particle object is reused, so copy anything you need later.
   */
  draw: {
    (alpha?: number): void;
    (paint: (particle: Particle) => void, alpha?: number): void;
  };
  /** Kill every particle at once, without drawing them out. */
  clear: () => void;
}

interface Slot {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  prevAngle: number;
  spin: number;
  size: number;
  prevSize: number;
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
  image: ParticleImage | undefined;
}

interface View {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  life: number;
  maxLife: number;
  t: number;
  r: number;
  g: number;
  b: number;
  a: number;
  image: ParticleImage | undefined;
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

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function paintDefault(particle: Particle): void {
  const ctx = getActiveContext();
  const image = particle.image;
  if (image === undefined) {
    ctx.circle(particle.x, particle.y, particle.size);
    return;
  }
  const half = particle.size / 2;
  if (particle.angle === 0) {
    ctx.image(image, particle.x - half, particle.y - half, particle.size, particle.size);
    return;
  }
  ctx.push();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.angle);
  ctx.image(image, -half, -half, particle.size, particle.size);
  ctx.pop();
}

/**
 * A pooled particle system.
 *
 * The pool is allocated once. `emit` / `drip` / `update` / `draw` do not
 * allocate after that, which is the property the per-frame path depends on.
 * Circles and images stay high-level primitives — the command buffer never
 * sees a tessellated sprite.
 */
export function particles(options: ParticleSystemOptions): ParticleSystem {
  const capacity = options.capacity;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error("particles() capacity must be a positive integer");
  }

  const gravityX = options.gravity?.x ?? 0;
  const gravityY = options.gravity?.y ?? 0;
  const drag = options.drag ?? 0;
  const blend = options.blend ?? Blend.Add;
  const defaultImage = options.image;
  const rngOption = options.random;
  const colors = new ColorCache();
  const startCol: [number, number, number, number] = [1, 1, 1, 1];
  const endCol: [number, number, number, number] = [1, 1, 1, 0];
  const view: View = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    size: 0,
    life: 0,
    maxLife: 1,
    t: 0,
    r: 1,
    g: 1,
    b: 1,
    a: 1,
    image: undefined,
  };

  const slots: Slot[] = [];
  for (let i = 0; i < capacity; i++) {
    slots.push({
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      prevAngle: 0,
      spin: 0,
      size: 0,
      prevSize: 0,
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
      image: undefined,
    });
  }

  let count = 0;
  let dripCarry = 0;

  const kill = (index: number): void => {
    count -= 1;
    if (index === count) return;
    const dead = slots[index] as Slot;
    slots[index] = slots[count] as Slot;
    slots[count] = dead;
  };

  const spawn = (burst: ParticleBurst | ParticleDrip, n: number): void => {
    const rng = rngForEmit(rngOption);
    writeColor(colors, burst.color, startCol, OPAQUE_WHITE);
    if (burst.endColor === undefined) {
      endCol[0] = startCol[0];
      endCol[1] = startCol[1];
      endCol[2] = startCol[2];
      endCol[3] = 0;
    } else {
      writeColor(colors, burst.endColor, endCol, startCol);
    }
    const image = burst.image ?? defaultImage;
    for (let i = 0; i < n; i++) {
      if (count >= capacity) return;
      const slot = slots[count] as Slot;
      count += 1;
      const speed = sample(rng, burst.speed, 0);
      const heading =
        burst.angle === undefined ? rng.range(0, Math.PI * 2) : sample(rng, burst.angle, 0);
      const life = Math.max(1e-6, sample(rng, burst.life, 1));
      const size0 = Math.max(0, sample(rng, burst.size, 8));
      const size1 = Math.max(0, sample(rng, burst.endSize, size0));
      const vx = Math.cos(heading) * speed + sample(rng, burst.vx, 0);
      const vy = Math.sin(heading) * speed + sample(rng, burst.vy, 0);
      const rotation =
        burst.rotation === undefined ? Math.atan2(vy, vx) : sample(rng, burst.rotation, 0);
      const x = sample(rng, burst.x, 0);
      const y = sample(rng, burst.y, 0);
      slot.x = x;
      slot.y = y;
      slot.prevX = x;
      slot.prevY = y;
      slot.vx = vx;
      slot.vy = vy;
      slot.angle = rotation;
      slot.prevAngle = rotation;
      slot.spin = sample(rng, burst.spin, 0);
      slot.life = life;
      slot.maxLife = life;
      slot.t = 0;
      slot.size0 = size0;
      slot.size1 = size1;
      slot.size = size0;
      slot.prevSize = size0;
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
      slot.image = image;
    }
  };

  /**
   * The pass, hoisted out of `drawImpl` along with its arguments.
   *
   * `with` wants an overrides object and a callback, and a system that
   * allocated both on every frame would undo the point of pooling the
   * particles. Neither changes between frames, so both are built once and the
   * three per-call arguments are handed over in these three slots.
   */
  const passOverrides: StyleOverrides = { blendMode: blend };
  let passPainter: (particle: Particle) => void = paintDefault;
  let passAutomatic = false;
  let passAlpha = 1;

  const runPass = (): void => {
    const painter = passPainter;
    const automatic = passAutomatic;
    const alpha = passAlpha;
    const ctx = getActiveContext();
    if (automatic) {
      ctx.noStroke();
      ctx.noTint();
    }
    let lastR = NaN;
    let lastG = NaN;
    let lastB = NaN;
    let lastA = NaN;
    let lastImage = false;
    for (let i = 0; i < count; i++) {
      const slot = slots[i] as Slot;
      view.x = lerp(slot.prevX, slot.x, alpha);
      view.y = lerp(slot.prevY, slot.y, alpha);
      view.angle = lerp(slot.prevAngle, slot.angle, alpha);
      view.size = lerp(slot.prevSize, slot.size, alpha);
      view.vx = slot.vx;
      view.vy = slot.vy;
      view.spin = slot.spin;
      view.life = slot.life;
      view.maxLife = slot.maxLife;
      view.t = slot.t;
      view.r = slot.r;
      view.g = slot.g;
      view.b = slot.b;
      view.a = slot.a;
      view.image = slot.image;
      if (automatic) {
        const isImage = view.image !== undefined;
        if (
          isImage !== lastImage ||
          view.r !== lastR ||
          view.g !== lastG ||
          view.b !== lastB ||
          view.a !== lastA
        ) {
          if (isImage) ctx.tintRgba(view.r, view.g, view.b, view.a);
          else ctx.fillRgba(view.r, view.g, view.b, view.a);
          lastR = view.r;
          lastG = view.g;
          lastB = view.b;
          lastA = view.a;
          lastImage = isImage;
        }
      }
      painter(view);
    }
  };

  /**
   * Draw the live particles.
   *
   * Through `with` rather than `push`/`blendMode`/`pop`: those restore what the
   * backend holds but leave the context's own copy of the style set to the
   * particle blend, and the next frame opens by re-emitting that copy. One
   * burst of sparks would turn the whole scene additive from the following
   * frame on — which reads as a scene that quietly stops being able to paint
   * over anything.
   */
  const drawImpl = (paint: ((particle: Particle) => void) | undefined, alpha: number): void => {
    passPainter = paint ?? paintDefault;
    passAutomatic = paint === undefined;
    passAlpha = alpha;
    getActiveContext().with(passOverrides, runPass);
  };

  const draw = ((
    paintOrAlpha?: ((particle: Particle) => void) | number,
    maybeAlpha?: number,
  ): void => {
    if (typeof paintOrAlpha === "function") {
      drawImpl(paintOrAlpha, maybeAlpha ?? 1);
      return;
    }
    drawImpl(undefined, paintOrAlpha ?? 1);
  }) as ParticleSystem["draw"];

  return {
    capacity,
    get count(): number {
      return count;
    },
    emit: (burst: ParticleBurst): void => {
      spawn(burst, Math.max(0, Math.trunc(burst.count ?? 1)));
    },
    drip: (flow: ParticleDrip, dt: number): void => {
      dripCarry += Math.max(0, flow.rate) * dt;
      const n = Math.trunc(dripCarry);
      if (n <= 0) return;
      dripCarry -= n;
      spawn(flow, n);
    },
    update: (dt: number): void => {
      const damp = drag === 0 ? 1 : Math.max(0, 1 - drag * dt);
      for (let i = count - 1; i >= 0; i--) {
        const slot = slots[i] as Slot;
        slot.prevX = slot.x;
        slot.prevY = slot.y;
        slot.prevAngle = slot.angle;
        slot.prevSize = slot.size;
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
        slot.angle += slot.spin * dt;
        slot.size = slot.size0 + (slot.size1 - slot.size0) * t;
        slot.r = slot.r0 + (slot.r1 - slot.r0) * t;
        slot.g = slot.g0 + (slot.g1 - slot.g0) * t;
        slot.b = slot.b0 + (slot.b1 - slot.b0) * t;
        slot.a = slot.a0 + (slot.a1 - slot.a0) * t;
      }
    },
    draw,
    clear: (): void => {
      count = 0;
      dripCarry = 0;
    },
  };
}
