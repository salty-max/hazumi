import { Blend, Op } from './op';

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

  // --- state ---

  setFill(r: number, g: number, b: number, a: number): void {
    this.#write4(Op.SetFill, r, g, b, a);
  }

  setStroke(r: number, g: number, b: number, a: number): void {
    this.#write4(Op.SetStroke, r, g, b, a);
  }

  setStrokeWidth(width: number): void {
    const i = this.#reserve(2);
    this.#u32[i] = Op.SetStrokeWidth;
    this.#f32[i + 1] = width;
  }

  setBlend(mode: Blend): void {
    const i = this.#reserve(2);
    this.#u32[i] = Op.SetBlend;
    // Written as an integer: it is an enum tag, not a measurement.
    this.#u32[i + 1] = mode;
  }

  /** Saves style and transform together, like p5's push(). */
  push(): void {
    this.#u32[this.#reserve(1)] = Op.Push;
  }

  pop(): void {
    this.#u32[this.#reserve(1)] = Op.Pop;
  }

  // --- transform ---

  translate(x: number, y: number): void {
    const i = this.#reserve(3);
    this.#u32[i] = Op.Translate;
    this.#f32[i + 1] = x;
    this.#f32[i + 2] = y;
  }

  rotate(radians: number): void {
    const i = this.#reserve(2);
    this.#u32[i] = Op.Rotate;
    this.#f32[i + 1] = radians;
  }

  scale(x: number, y: number): void {
    const i = this.#reserve(3);
    this.#u32[i] = Op.Scale;
    this.#f32[i + 1] = x;
    this.#f32[i + 2] = y;
  }

  // --- primitives ---

  /**
   * Clear everything drawn so far to this colour.
   *
   * Backends may discard the commands preceding it rather than actually
   * painting over them — the result is identical and much cheaper.
   */
  background(r: number, g: number, b: number, a: number): void {
    this.#write4(Op.Background, r, g, b, a);
  }

  ellipse(x: number, y: number, radiusX: number, radiusY: number): void {
    this.#write4(Op.Ellipse, x, y, radiusX, radiusY);
  }

  circle(x: number, y: number, radius: number): void {
    const i = this.#reserve(4);
    this.#u32[i] = Op.Circle;
    this.#f32[i + 1] = x;
    this.#f32[i + 2] = y;
    this.#f32[i + 3] = radius;
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.#write4(Op.Rect, x, y, width, height);
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    this.#write4(Op.Line, x1, y1, x2, y2);
  }

  #write4(op: Op, a: number, b: number, c: number, d: number): void {
    const i = this.#reserve(5);
    const f = this.#f32;
    this.#u32[i] = op;
    f[i + 1] = a;
    f[i + 2] = b;
    f[i + 3] = c;
    f[i + 4] = d;
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
