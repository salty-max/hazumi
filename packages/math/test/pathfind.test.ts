import { describe, expect, test } from "bun:test";
import { pathfind } from "../src/index";

function waypoints(path: pathfind.Path): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (let i = 0; i < path.length; i++) {
    out.push([path.points[i * 2] as number, path.points[i * 2 + 1] as number]);
  }
  return out;
}

describe("pathfind.grid", () => {
  test("starts walkable and reports 0 off the map", () => {
    const map = pathfind.grid(3, 2);
    expect(map.columns).toBe(3);
    expect(map.rows).toBe(2);
    expect(map.cost(0, 0)).toBe(1);
    expect(map.cost(2, 1)).toBe(1);
    expect(map.cost(-1, 0)).toBe(0);
    expect(map.cost(0, 2)).toBe(0);
  });

  test("set and fill write costs, and block at 0", () => {
    const map = pathfind.grid(2, 2, 4);
    expect(map.cost(0, 0)).toBe(4);
    map.set(1, 1, 0);
    expect(map.cost(1, 1)).toBe(0);
    map.fill(2);
    expect(map.cost(1, 1)).toBe(2);
  });

  test("rejects a grid that cannot exist", () => {
    expect(() => pathfind.grid(0, 3)).toThrow(RangeError);
    expect(() => pathfind.grid(3, 1.5)).toThrow(RangeError);
    expect(() => pathfind.grid(2, 2).set(2, 0, 1)).toThrow(RangeError);
  });
});

describe("pathfind.astar", () => {
  test("walks a straight orthogonal path including both ends", () => {
    const map = pathfind.grid(5, 1);
    const path = pathfind.astar(map, 0, 0, 4, 0);
    expect(path).not.toBeNull();
    expect(waypoints(path!)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
  });

  test("start equal to goal is a one-cell path", () => {
    const map = pathfind.grid(3, 3);
    const path = pathfind.astar(map, 1, 1, 1, 1);
    expect(waypoints(path!)).toEqual([[1, 1]]);
  });

  test("goes around a wall", () => {
    const map = pathfind.grid(3, 3);
    map.set(1, 0, 0);
    map.set(1, 1, 0);
    const path = pathfind.astar(map, 0, 0, 2, 0);
    expect(path).not.toBeNull();
    expect(waypoints(path!)[0]).toEqual([0, 0]);
    expect(waypoints(path!).at(-1)).toEqual([2, 0]);
    for (const [column, row] of waypoints(path!)) {
      expect(map.cost(column, row)).toBeGreaterThan(0);
    }
    expect(path!.length).toBeGreaterThan(3);
  });

  test("returns null when there is no route", () => {
    const map = pathfind.grid(3, 1);
    map.set(1, 0, 0);
    expect(pathfind.astar(map, 0, 0, 2, 0)).toBeNull();
  });

  test("returns null when start or goal is blocked or off the map", () => {
    const map = pathfind.grid(3, 3);
    map.set(0, 0, 0);
    expect(pathfind.astar(map, 0, 0, 2, 2)).toBeNull();
    map.set(0, 0, 1);
    map.set(2, 2, 0);
    expect(pathfind.astar(map, 0, 0, 2, 2)).toBeNull();
    expect(pathfind.astar(map, -1, 0, 1, 1)).toBeNull();
    expect(pathfind.astar(map, 0, 0, 9, 9)).toBeNull();
  });

  test("diagonal is shorter and does not squeeze through a corner", () => {
    const open = pathfind.grid(3, 3);
    const cardinal = pathfind.astar(open, 0, 0, 2, 2);
    const diagonal = pathfind.astar(open, 0, 0, 2, 2, { diagonal: true });
    expect(cardinal!.length).toBe(5);
    expect(diagonal!.length).toBe(3);

    const corner = pathfind.grid(2, 2, 0);
    corner.set(0, 0, 1);
    corner.set(1, 1, 1);
    expect(pathfind.astar(corner, 0, 0, 1, 1, { diagonal: true })).toBeNull();
  });

  test("higher cost cells are avoided when a cheaper route exists", () => {
    const map = pathfind.grid(3, 2, 1);
    map.set(1, 0, 50);
    const path = pathfind.astar(map, 0, 0, 2, 0);
    expect(waypoints(path!)).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 0],
    ]);
  });

  test("writes into a reusable path and clears it on failure", () => {
    const map = pathfind.grid(3, 1);
    const out = pathfind.createPath();
    const found = pathfind.astar(map, 0, 0, 2, 0, { out });
    expect(found).toBe(out);
    expect(out.length).toBe(3);
    map.set(1, 0, 0);
    expect(pathfind.astar(map, 0, 0, 2, 0, { out })).toBeNull();
    expect(out.length).toBe(0);
  });

  test("lazy re-push may grow the heap past the cell count", () => {
    // Decrease-key is a second heap entry. A typed array sized to V silently
    // drops writes past the end, so a cost field that relaxes the same cell
    // many times has to be allowed to grow.
    const map = pathfind.grid(24, 24, 0.25);
    for (let row = 0; row < 24; row++) {
      for (let column = 0; column < 24; column++) {
        map.set(column, row, 0.25 + ((column * 13 + row * 7) % 9) * 0.05);
      }
    }
    const path = pathfind.astar(map, 0, 0, 23, 23);
    expect(path).not.toBeNull();
    expect(waypoints(path!)[0]).toEqual([0, 0]);
    expect(waypoints(path!).at(-1)).toEqual([23, 23]);
    const again = pathfind.astar(map, 23, 23, 0, 0, { out: path! });
    expect(again).not.toBeNull();
    expect(waypoints(again!).at(-1)).toEqual([0, 0]);
  });

  test("rejects a grid it did not create", () => {
    const fake = {
      columns: 1,
      rows: 1,
      cells: new Float64Array([1]),
      cost: (): number => 1,
      set: (): void => {},
      fill: (): void => {},
    };
    expect(() => pathfind.astar(fake, 0, 0, 0, 0)).toThrow(TypeError);
  });
});
