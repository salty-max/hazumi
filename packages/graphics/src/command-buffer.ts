import { Op } from './op';

/** Words (4 bytes each) reserved on first allocation. */
const INITIAL_WORDS = 1024;

/**
 * Struct-of-arrays command buffer.
 *
 * One `ArrayBuffer` carries every command, viewed simultaneously as `Uint32Array`
 * (opcodes) and `Float32Array` (operands), so the two can never drift out of
 * sync the way parallel buffers would. Layout is `[opcode][operands...]`, with
 * per-opcode widths in `OP_SIZE`.
 *
 * The write path allocates only when growing. After the first few frames the
 * capacity settles and encoding is allocation-free, which is the property the
 * whole design depends on — see AGENTS.md.
 *
 * INVARIANT: this stores high-level primitives, never triangles. Tessellation
 * belongs to the backend.
 */
export class CommandBuffer {
  #data: ArrayBuffer;
  #f32: Float32Array;
  #u32: Uint32Array;
  #length = 0;
  #growths = 0;

  constructor(initialWords: number = INITIAL_WORDS) {
    this.#data = new ArrayBuffer(initialWords * 4);
    this.#f32 = new Float32Array(this.#data);
    this.#u32 = new Uint32Array(this.#data);
  }

  /** Words written so far. */
  get length(): number {
    return this.#length;
  }

  /** Words the buffer can hold before it must grow. */
  get capacity(): number {
    return this.#u32.length;
  }

  /**
   * How many times this buffer has reallocated. Steady state is a constant —
   * a number that keeps climbing means the encode path is still allocating.
   */
  get growths(): number {
    return this.#growths;
  }

  /** Raw views, for backends that walk the stream directly. */
  get f32(): Float32Array {
    return this.#f32;
  }

  get u32(): Uint32Array {
    return this.#u32;
  }

  /** Rewind the write cursor. Does not release memory — that is the point. */
  reset(): void {
    this.#length = 0;
  }

  setFill(r: number, g: number, b: number, a: number): void {
    const i = this.#reserve(5);
    const f = this.#f32;
    this.#u32[i] = Op.SetFill;
    f[i + 1] = r;
    f[i + 2] = g;
    f[i + 3] = b;
    f[i + 4] = a;
  }

  circle(x: number, y: number, radius: number): void {
    const i = this.#reserve(4);
    const f = this.#f32;
    this.#u32[i] = Op.Circle;
    f[i + 1] = x;
    f[i + 2] = y;
    f[i + 3] = radius;
  }

  rect(x: number, y: number, width: number, height: number): void {
    const i = this.#reserve(5);
    const f = this.#f32;
    this.#u32[i] = Op.Rect;
    f[i + 1] = x;
    f[i + 2] = y;
    f[i + 3] = width;
    f[i + 4] = height;
  }

  #reserve(words: number): number {
    const start = this.#length;
    const needed = start + words;
    if (needed > this.#u32.length) this.#grow(needed);
    this.#length = needed;
    return start;
  }

  #grow(needed: number): void {
    let words = this.#u32.length;
    while (words < needed) words *= 2;

    const next = new ArrayBuffer(words * 4);
    const nextU32 = new Uint32Array(next);
    nextU32.set(this.#u32);

    this.#data = next;
    this.#u32 = nextU32;
    this.#f32 = new Float32Array(next);
    this.#growths++;
  }
}
