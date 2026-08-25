/**
 * A fixed set of reusable objects, for the things a game spawns and kills.
 *
 * Every scene that fires a bullet writes the same three pieces: an array
 * preallocated at startup, a `live` flag on each entry, and a loop that skips
 * the dead ones. Starfall wrote it three times — shots, enemies, pickups —
 * which is about fifty lines saying nothing about the game.
 *
 * The particle system has had pooling since the beginning. This is the same
 * idea for the objects a game defines itself, which is the half that was
 * missing: the engine solved the problem for its own objects and left yours to
 * you.
 *
 * Liveness is not a field on your object. The pool keeps the live entries at
 * the front of its own array and swaps the last one into the gap when
 * something dies, so iterating is a plain run with no test in it and killing
 * costs nothing. Your type stays whatever you wanted it to be.
 */

export interface Pool<T> {
  /** Objects made at construction. The pool never grows past this. */
  readonly capacity: number;
  /** How many are alive right now. */
  readonly count: number;
  /**
   * Wake one up, hand it to `init`, and return it. Null when the pool is full.
   *
   * The object is one that was made at construction and may have been used
   * before, so `init` has to set every field it cares about — there is no
   * fresh allocation to inherit defaults from. That is the trade a pool makes.
   */
  spawn: (init: (item: T) => void) => T | null;
  /**
   * Run `body` on every live object.
   *
   * Killing during iteration is safe, including killing the object in hand.
   * Order is unspecified and changes as things die: a pool is a bag, and a
   * scene that needs a painting order should sort or use `layer()`.
   */
  forEach: (body: (item: T) => void) => void;
  /** Retire one. Ignores an object this pool does not have alive. */
  kill: (item: T) => void;
  /** Retire everything, keeping the objects for reuse. */
  clear: () => void;
}

/** How a pool is built. Both are required — a pool has nothing to default to. */
export interface PoolOptions<T> {
  /** How many to make. Preallocated, and the ceiling on live objects. */
  readonly capacity: number;
  /** Builds one. Called `capacity` times at construction and never again. */
  readonly make: () => T;
}

/**
 * A pool was asked for with a capacity that cannot hold anything.
 *
 * Thrown at construction rather than tolerated, because a pool of zero accepts
 * every spawn and shows nothing — a scene that silently draws no bullets is
 * far harder to diagnose than one that refuses to start.
 */
export class InvalidPoolError extends Error {
  constructor(capacity: number) {
    super(`A pool needs a capacity of at least one; got ${capacity}`);
    this.name = "InvalidPoolError";
  }
}

/**
 * Build a pool.
 *
 * ```ts
 * const shots = pool({ capacity: 120, make: () => ({ x: 0, y: 0, vy: 0 }) });
 *
 * shots.spawn((shot) => {
 *   shot.x = player.x;
 *   shot.y = player.y;
 *   shot.vy = -600;
 * });
 *
 * shots.forEach((shot) => {
 *   shot.y += shot.vy * dt;
 *   if (shot.y < 0) shots.kill(shot);
 * });
 * ```
 */
export function pool<T>(options: PoolOptions<T>): Pool<T> {
  const { capacity, make } = options;
  if (!Number.isFinite(capacity) || capacity < 1) throw new InvalidPoolError(capacity);

  const items: T[] = Array.from({ length: Math.floor(capacity) }, make);
  /** Live objects are `items[0 .. live)`. Everything past it is asleep. */
  let live = 0;

  const swapOut = (index: number): void => {
    live--;
    const last = items[live] as T;
    items[live] = items[index] as T;
    items[index] = last;
  };

  return {
    capacity: items.length,
    get count() {
      return live;
    },
    spawn: (init) => {
      if (live >= items.length) return null;
      const item = items[live] as T;
      live++;
      init(item);
      return item;
    },
    forEach: (body) => {
      // Backwards, so a kill inside the body is safe: the swap moves an object
      // from the far end, which this walk has already been past.
      for (let i = live - 1; i >= 0; i--) {
        if (i < live) body(items[i] as T);
      }
    },
    kill: (item) => {
      const index = items.indexOf(item);
      if (index < 0 || index >= live) return;
      swapOut(index);
    },
    clear: () => {
      live = 0;
    },
  };
}
