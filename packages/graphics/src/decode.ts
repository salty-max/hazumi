import type { CommandBuffer } from './command-buffer';
import { type Blend, Op, OP_SIZE } from './op';

/**
 * Backends implement this to consume a command stream. Every method takes
 * primitives, never objects, so a full walk allocates nothing.
 */
export interface CommandVisitor {
  setFill?: (r: number, g: number, b: number, a: number) => void;
  setStroke?: (r: number, g: number, b: number, a: number) => void;
  setStrokeWidth?: (width: number) => void;
  setBlend?: (mode: Blend) => void;
  push?: () => void;
  pop?: () => void;
  translate?: (x: number, y: number) => void;
  rotate?: (radians: number) => void;
  scale?: (x: number, y: number) => void;
  circle?: (x: number, y: number, radius: number) => void;
  rect?: (x: number, y: number, width: number, height: number) => void;
  line?: (x1: number, y1: number, x2: number, y2: number) => void;
}

/** Thrown when the stream contains an opcode this build does not know. */
export class UnknownOpcodeError extends Error {
  readonly opcode: number;
  readonly offset: number;

  constructor(opcode: number, offset: number) {
    super(`Unknown opcode ${opcode} at word ${offset}`);
    this.name = 'UnknownOpcodeError';
    this.opcode = opcode;
    this.offset = offset;
  }
}

/**
 * Walk a command buffer front to back, dispatching to `visitor`.
 *
 * Allocation-free: no iterators, no closures, no intermediate objects.
 */
export function decode(buffer: CommandBuffer, visitor: CommandVisitor): void {
  const u32 = buffer.u32;
  const f32 = buffer.f32;
  const end = buffer.length;

  let i = 0;
  while (i < end) {
    const op = u32[i] as Op;

    switch (op) {
      case Op.SetFill:
        visitor.setFill?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      case Op.SetStroke:
        visitor.setStroke?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      case Op.SetStrokeWidth:
        visitor.setStrokeWidth?.(f32[i + 1] as number);
        break;
      case Op.SetBlend:
        // Read from the integer view: it is an enum tag, not a measurement.
        visitor.setBlend?.(u32[i + 1] as Blend);
        break;
      case Op.Push:
        visitor.push?.();
        break;
      case Op.Pop:
        visitor.pop?.();
        break;
      case Op.Translate:
        visitor.translate?.(f32[i + 1] as number, f32[i + 2] as number);
        break;
      case Op.Rotate:
        visitor.rotate?.(f32[i + 1] as number);
        break;
      case Op.Scale:
        visitor.scale?.(f32[i + 1] as number, f32[i + 2] as number);
        break;
      case Op.Circle:
        visitor.circle?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number);
        break;
      case Op.Rect:
        visitor.rect?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      case Op.Line:
        visitor.line?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      default: {
        const size = OP_SIZE[op] as number | undefined;
        if (size === undefined) throw new UnknownOpcodeError(op, i);
        break;
      }
    }

    i += OP_SIZE[op] as number;
  }
}
