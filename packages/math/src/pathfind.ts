/**
 * Grid A*. Walkability is a cost grid, not a tilemap — `EMPTY_TILE` means
 * "do not draw", not "you can walk here".
 *
 * Cell cost 0 or negative is blocked. Positive costs weight the traversal;
 * values below 1 still find a path but the heuristic assumes a minimum of 1,
 * so they may not be optimal.
 *
 * Scratch lives on the grid so a repeated search after the first allocates
 * nothing. Two searches on the same grid must not overlap.
 */

const SQRT2 = Math.SQRT2;
const OCTILE = Math.SQRT2 - 1;
const ORTHOGONAL = 4;
const DIAGONAL = 8;
const NEIGHBOR_DC = [-1, 1, 0, 0, -1, 1, -1, 1];
const NEIGHBOR_DR = [0, 0, -1, 1, -1, -1, 1, 1];

/** Row-major grid of traversal costs. */
export interface Grid {
  readonly columns: number;
  readonly rows: number;
  /**
   * Packed `columns * rows` costs, row-major. Write through `set` / `fill`
   * unless you already have an index.
   */
  readonly cells: Float64Array;
  /** 0 when the cell is out of bounds or blocked. */
  cost: (column: number, row: number) => number;
  set: (column: number, row: number, cost: number) => void;
  fill: (cost: number) => void;
}

/** Waypoints in cell coordinates, start through goal. */
export interface Path {
  /** Number of waypoints currently stored. */
  length: number;
  /** Interleaved `column, row`. Only the first `length` pairs are live. */
  readonly points: Int32Array;
}

/** How `astar` should search. */
export interface AstarOptions {
  /** Allow diagonal moves. Defaults to false. Diagonals cannot cut a corner. */
  readonly diagonal?: boolean;
  /** Overwritten and returned on success. */
  readonly out?: Path;
}

class PathBuffer implements Path {
  length = 0;
  points: Int32Array;

  constructor(capacity = 16) {
    this.points = new Int32Array(Math.max(2, capacity * 2));
  }

  ensure(count: number): void {
    const need = count * 2;
    if (this.points.length >= need) return;
    let cap = this.points.length;
    while (cap < need) cap *= 2;
    const next = new Int32Array(cap);
    next.set(this.points);
    this.points = next;
  }
}

class PathGrid implements Grid {
  readonly columns: number;
  readonly rows: number;
  readonly cells: Float64Array;
  readonly g: Float64Array;
  readonly f: Float64Array;
  readonly cameFrom: Int32Array;
  readonly stamp: Uint32Array;
  readonly closed: Uint32Array;
  heap: Int32Array;
  heapF: Float64Array;
  heapSize = 0;
  generation = 1;

  constructor(columns: number, rows: number, fill: number) {
    const size = columns * rows;
    this.columns = columns;
    this.rows = rows;
    this.cells = new Float64Array(size);
    this.cells.fill(fill);
    this.g = new Float64Array(size);
    this.f = new Float64Array(size);
    this.cameFrom = new Int32Array(size);
    this.stamp = new Uint32Array(size);
    this.closed = new Uint32Array(size);
    this.heap = new Int32Array(size);
    this.heapF = new Float64Array(size);
  }

  cost(column: number, row: number): number {
    const index = cellIndex(this.columns, this.rows, column, row);
    if (index === undefined) return 0;
    const value = this.cells[index] as number;
    return value > 0 ? value : 0;
  }

  set(column: number, row: number, cost: number): void {
    const index = cellIndex(this.columns, this.rows, column, row);
    if (index === undefined) {
      throw new RangeError("Grid cell is out of bounds");
    }
    if (!Number.isFinite(cost)) throw new RangeError("Grid cost must be a finite number");
    this.cells[index] = cost;
  }

  fill(cost: number): void {
    if (!Number.isFinite(cost)) throw new RangeError("Grid cost must be a finite number");
    this.cells.fill(cost);
  }
}

/** Build a grid filled with `cost` (defaults to 1 — everywhere walkable). */
export function grid(columns: number, rows: number, cost = 1): Grid {
  if (!Number.isInteger(columns) || columns <= 0) {
    throw new RangeError("Grid columns must be a positive integer");
  }
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new RangeError("Grid rows must be a positive integer");
  }
  if (!Number.isFinite(cost)) throw new RangeError("Grid cost must be a finite number");
  return new PathGrid(columns, rows, cost);
}

/** Empty reusable path. Grows to the longest route asked of it, then stops. */
export function createPath(): Path {
  return new PathBuffer();
}

/**
 * Shortest walk from start to goal. `null` if either cell is blocked or no
 * route exists. Includes both endpoints.
 */
export function astar(
  map: Grid,
  startColumn: number,
  startRow: number,
  goalColumn: number,
  goalRow: number,
  options: AstarOptions = {},
): Path | null {
  const search = asSearchGrid(map);
  const start = cellIndex(search.columns, search.rows, startColumn, startRow);
  const goal = cellIndex(search.columns, search.rows, goalColumn, goalRow);
  if (start === undefined || goal === undefined) return null;
  if ((search.cells[start] as number) <= 0 || (search.cells[goal] as number) <= 0) return null;

  const path = options.out instanceof PathBuffer ? options.out : new PathBuffer();
  if (start === goal) {
    path.ensure(1);
    path.length = 1;
    path.points[0] = startColumn;
    path.points[1] = startRow;
    return path;
  }

  const neighbors = options.diagonal === true ? DIAGONAL : ORTHOGONAL;
  beginSearch(search);
  search.g[start] = 0;
  search.f[start] = heuristic(startColumn, startRow, goalColumn, goalRow, neighbors);
  search.cameFrom[start] = start;
  search.stamp[start] = search.generation;
  heapPush(search, start, search.f[start] as number);

  while (search.heapSize > 0) {
    const current = heapPop(search);
    if (current === undefined) break;
    if (search.closed[current] === search.generation) continue;
    search.closed[current] = search.generation;
    if (current === goal) {
      reconstruct(search, start, goal, path);
      return path;
    }

    const currentColumn = current % search.columns;
    const currentRow = (current / search.columns) | 0;
    const currentG = search.g[current] as number;

    for (let n = 0; n < neighbors; n++) {
      const nextColumn = currentColumn + (NEIGHBOR_DC[n] as number);
      const nextRow = currentRow + (NEIGHBOR_DR[n] as number);
      const next = cellIndex(search.columns, search.rows, nextColumn, nextRow);
      if (next === undefined) continue;
      if (search.closed[next] === search.generation) continue;
      const stepCost = search.cells[next] as number;
      if (stepCost <= 0) continue;
      if (n >= ORTHOGONAL && blocksCorner(search, currentColumn, currentRow, nextColumn, nextRow)) {
        continue;
      }
      const tentative = currentG + stepCost * (n >= ORTHOGONAL ? SQRT2 : 1);
      if (search.stamp[next] === search.generation && tentative >= (search.g[next] as number)) {
        continue;
      }
      search.stamp[next] = search.generation;
      search.g[next] = tentative;
      search.cameFrom[next] = current;
      const f = tentative + heuristic(nextColumn, nextRow, goalColumn, goalRow, neighbors);
      search.f[next] = f;
      heapPush(search, next, f);
    }
  }

  path.length = 0;
  return null;
}

function asSearchGrid(map: Grid): PathGrid {
  if (map instanceof PathGrid) return map;
  throw new TypeError("pathfind.astar expects a grid from pathfind.grid()");
}

function cellIndex(columns: number, rows: number, column: number, row: number): number | undefined {
  if (!Number.isInteger(column) || !Number.isInteger(row)) return undefined;
  if (column < 0 || row < 0 || column >= columns || row >= rows) return undefined;
  return row * columns + column;
}

function heuristic(
  column: number,
  row: number,
  goalColumn: number,
  goalRow: number,
  neighbors: number,
): number {
  const dx = Math.abs(column - goalColumn);
  const dy = Math.abs(row - goalRow);
  if (neighbors === DIAGONAL) return Math.max(dx, dy) + OCTILE * Math.min(dx, dy);
  return dx + dy;
}

function blocksCorner(
  search: PathGrid,
  column: number,
  row: number,
  nextColumn: number,
  nextRow: number,
): boolean {
  const sideA = cellIndex(search.columns, search.rows, nextColumn, row);
  const sideB = cellIndex(search.columns, search.rows, column, nextRow);
  const costA = sideA === undefined ? 0 : (search.cells[sideA] as number);
  const costB = sideB === undefined ? 0 : (search.cells[sideB] as number);
  return costA <= 0 || costB <= 0;
}

function beginSearch(search: PathGrid): void {
  search.heapSize = 0;
  search.generation += 1;
  if (search.generation === 0) {
    search.stamp.fill(0);
    search.closed.fill(0);
    search.generation = 1;
  }
}

function ensureHeap(search: PathGrid): void {
  if (search.heapSize < search.heap.length) return;
  let cap = search.heap.length;
  if (cap === 0) cap = 1;
  while (cap <= search.heapSize) cap *= 2;
  const next = new Int32Array(cap);
  next.set(search.heap);
  search.heap = next;
  const nextF = new Float64Array(cap);
  nextF.set(search.heapF);
  search.heapF = nextF;
}

function heapPush(search: PathGrid, index: number, f: number): void {
  ensureHeap(search);
  let hole = search.heapSize;
  search.heapSize += 1;
  while (hole > 0) {
    const parent = (hole - 1) >> 1;
    if (f >= (search.heapF[parent] as number)) break;
    search.heap[hole] = search.heap[parent] as number;
    search.heapF[hole] = search.heapF[parent] as number;
    hole = parent;
  }
  search.heap[hole] = index;
  search.heapF[hole] = f;
}

function heapPop(search: PathGrid): number | undefined {
  if (search.heapSize === 0) return undefined;
  const index = search.heap[0] as number;
  search.heapSize -= 1;
  if (search.heapSize === 0) return index;
  const last = search.heap[search.heapSize] as number;
  const lastF = search.heapF[search.heapSize] as number;
  let hole = 0;
  for (;;) {
    const left = hole * 2 + 1;
    if (left >= search.heapSize) break;
    let child = left;
    const right = left + 1;
    if (
      right < search.heapSize &&
      (search.heapF[right] as number) < (search.heapF[left] as number)
    ) {
      child = right;
    }
    if (lastF <= (search.heapF[child] as number)) break;
    search.heap[hole] = search.heap[child] as number;
    search.heapF[hole] = search.heapF[child] as number;
    hole = child;
  }
  search.heap[hole] = last;
  search.heapF[hole] = lastF;
  return index;
}

function reconstruct(search: PathGrid, start: number, goal: number, path: PathBuffer): void {
  let count = 1;
  for (let index = goal; index !== start; index = search.cameFrom[index] as number) count++;
  path.ensure(count);
  path.length = count;
  let index = goal;
  for (let step = count - 1; step >= 0; step--) {
    path.points[step * 2] = index % search.columns;
    path.points[step * 2 + 1] = (index / search.columns) | 0;
    index = search.cameFrom[index] as number;
  }
}
