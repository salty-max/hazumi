import { describe, expect, test } from "bun:test";
import { InvalidPoolError, pool } from "../src/pool";

interface Shot {
  x: number;
  y: number;
}

const shots = (capacity = 4) => pool<Shot>({ capacity, make: () => ({ x: 0, y: 0 }) });

const live = (p: ReturnType<typeof shots>): Shot[] => {
  const seen: Shot[] = [];
  p.forEach((item) => seen.push(item));
  return seen;
};

describe("pool", () => {
  test("makes every object once, at construction", () => {
    let made = 0;
    const p = pool({
      capacity: 3,
      make: () => {
        made++;
        return { x: 0 };
      },
    });
    expect([made, p.capacity, p.count]).toEqual([3, 3, 0]);
    p.spawn(() => {});
    p.spawn(() => {});
    // Spawning reuses what was already built rather than allocating.
    expect(made).toBe(3);
  });

  test("hands the spawned object to init and back to the caller", () => {
    const p = shots();
    const shot = p.spawn((item) => {
      item.x = 7;
      item.y = 9;
    });
    expect(shot).toEqual({ x: 7, y: 9 });
    expect(p.count).toBe(1);
  });

  test("returns null when full rather than growing", () => {
    const p = shots(2);
    expect(p.spawn(() => {})).not.toBeNull();
    expect(p.spawn(() => {})).not.toBeNull();
    // A pool that grew under load would allocate in the frame it can least
    // afford to, which is the whole reason to preallocate.
    expect(p.spawn(() => {})).toBeNull();
    expect(p.count).toBe(2);
  });

  test("iterates the live ones and nothing else", () => {
    const p = shots();
    p.spawn((s) => void (s.x = 1));
    p.spawn((s) => void (s.x = 2));
    expect(
      live(p)
        .map((s) => s.x)
        .toSorted(),
    ).toEqual([1, 2]);
  });

  test("killing during iteration still visits everyone exactly once", () => {
    // The trap this guards: a swap-remove during a forward walk moves an
    // unvisited object into the slot just passed, and it never runs.
    const p = shots(5);
    for (let i = 0; i < 5; i++) p.spawn((s) => void (s.x = i));
    const seen: number[] = [];
    p.forEach((item) => {
      seen.push(item.x);
      p.kill(item);
    });
    expect(seen.toSorted()).toEqual([0, 1, 2, 3, 4]);
    expect(p.count).toBe(0);
  });

  test("killing one object during iteration does not skip its neighbour", () => {
    const p = shots(4);
    for (let i = 0; i < 4; i++) p.spawn((s) => void (s.x = i));
    const seen: number[] = [];
    p.forEach((item) => {
      seen.push(item.x);
      if (item.x === 0) p.kill(item);
    });
    expect(seen.toSorted()).toEqual([0, 1, 2, 3]);
    expect(p.count).toBe(3);
  });

  test("a killed object is reused by the next spawn", () => {
    const p = shots(2);
    const first = p.spawn((s) => void (s.x = 1));
    p.spawn((s) => void (s.x = 2));
    p.kill(first as Shot);
    const next = p.spawn((s) => void (s.x = 3));
    // Same object, refilled: there is nothing else for it to be.
    expect(next).toBe(first as Shot);
    expect(p.count).toBe(2);
  });

  test("killing something already dead is ignored", () => {
    const p = shots();
    const shot = p.spawn(() => {}) as Shot;
    p.kill(shot);
    p.kill(shot);
    expect(p.count).toBe(0);
  });

  test("killing an object from another pool is ignored", () => {
    const a = shots();
    const b = shots();
    const theirs = b.spawn(() => {}) as Shot;
    a.spawn(() => {});
    a.kill(theirs);
    expect([a.count, b.count]).toEqual([1, 1]);
  });

  test("clear retires everything and keeps the objects", () => {
    const p = shots();
    const first = p.spawn((s) => void (s.x = 1)) as Shot;
    p.spawn(() => {});
    p.clear();
    expect([p.count, live(p).length]).toEqual([0, 0]);
    expect(p.spawn(() => {})).toBe(first);
  });

  test("refuses a capacity that cannot hold anything", () => {
    expect(() => pool({ capacity: 0, make: () => ({}) })).toThrow(InvalidPoolError);
    expect(() => pool({ capacity: Number.NaN, make: () => ({}) })).toThrow(InvalidPoolError);
  });
});
