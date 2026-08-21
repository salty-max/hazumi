import type { CommandBuffer, ImageSource } from './command-buffer';
import { type Align, type Baseline, type Blend, Op, OP_SIZE } from './op';

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
  background?: (r: number, g: number, b: number, a: number) => void;
  circle?: (x: number, y: number, radius: number) => void;
  ellipse?: (x: number, y: number, radiusX: number, radiusY: number) => void;
  rect?: (x: number, y: number, width: number, height: number) => void;
  line?: (x1: number, y1: number, x2: number, y2: number) => void;
  setTextSize?: (size: number) => void;
  setTextAlign?: (horizontal: Align, vertical: Baseline) => void;
  /** The resolved string, not its id — backends never see the table. */
  setFont?: (family: string) => void;
  text?: (x: number, y: number, content: string) => void;
  /** Receives the resolved image, not its id — backends never see the table. */
  image?: (
    source: ImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
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
  const strings = buffer.strings;
  const images = buffer.images;
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
      case Op.Background:
        visitor.background?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      case Op.Circle:
        visitor.circle?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number);
        break;
      case Op.Ellipse:
        visitor.ellipse?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      case Op.Rect:
        visitor.rect?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      case Op.Line:
        visitor.line?.(f32[i + 1] as number, f32[i + 2] as number, f32[i + 3] as number, f32[i + 4] as number);
        break;
      case Op.SetTextSize:
        visitor.setTextSize?.(f32[i + 1] as number);
        break;
      case Op.SetTextAlign:
        visitor.setTextAlign?.(u32[i + 1] as Align, u32[i + 2] as Baseline);
        break;
      case Op.SetFont:
        visitor.setFont?.(strings[u32[i + 1] as number] ?? 'sans-serif');
        break;
      case Op.Text:
        visitor.text?.(
          f32[i + 1] as number,
          f32[i + 2] as number,
          strings[u32[i + 3] as number] ?? '',
        );
        break;
      case Op.Image: {
        const source = images[u32[i + 1] as number];
        if (source !== undefined) {
          visitor.image?.(
            source,
            f32[i + 2] as number,
            f32[i + 3] as number,
            f32[i + 4] as number,
            f32[i + 5] as number,
          );
        }
        break;
      }
      default: {
        const size = OP_SIZE[op] as number | undefined;
        if (size === undefined) throw new UnknownOpcodeError(op, i);
        break;
      }
    }

    i += OP_SIZE[op] as number;
  }
}
