import { describe, expect, test } from 'bun:test';
import {
  CommandBuffer,
  decode,
  UnknownOpcodeError,
  type CommandVisitor,
} from '../src/index';

describe('decode', () => {
  test('dispatches commands in stream order', () => {
    const buf = new CommandBuffer();
    buf.setFill(1, 0, 0, 1);
    buf.circle(1, 2, 3);
    buf.rect(4, 5, 6, 7);
    buf.circle(8, 9, 10);

    const seen: string[] = [];
    const visitor: CommandVisitor = {
      setFill: (): void => void seen.push('fill'),
      circle: (): void => void seen.push('circle'),
      rect: (): void => void seen.push('rect'),
    };

    decode(buf, visitor);
    expect(seen).toEqual(['fill', 'circle', 'rect', 'circle']);
  });

  test('passes operands through exactly', () => {
    const buf = new CommandBuffer();
    buf.circle(1.5, -2.5, 0.25);

    let got: number[] = [];
    decode(buf, {
      circle: (x: number, y: number, r: number): void => {
        got = [x, y, r];
      },
    });

    expect(got).toEqual([1.5, -2.5, 0.25]);
  });

  test('skips commands the visitor does not implement', () => {
    const buf = new CommandBuffer();
    buf.setFill(1, 1, 1, 1);
    buf.circle(1, 2, 3);

    let circles = 0;
    // No setFill handler at all — the walk must still advance correctly.
    decode(buf, { circle: (): void => void circles++ });

    expect(circles).toBe(1);
  });

  test('walking an empty buffer is a no-op', () => {
    const buf = new CommandBuffer();
    let calls = 0;
    decode(buf, { circle: (): void => void calls++ });
    expect(calls).toBe(0);
  });

  test('rejects an opcode this build does not know', () => {
    const buf = new CommandBuffer();
    buf.circle(1, 2, 3);
    // Corrupt the opcode in place, simulating a stream from a newer build.
    buf.u32[0] = 999;

    expect(() => decode(buf, {})).toThrow(UnknownOpcodeError);
  });

  test('the unknown-opcode error reports what and where', () => {
    const buf = new CommandBuffer();
    buf.circle(1, 2, 3);
    buf.circle(4, 5, 6);
    buf.u32[4] = 999;

    try {
      decode(buf, {});
      throw new Error('expected decode to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownOpcodeError);
      expect((error as UnknownOpcodeError).opcode).toBe(999);
      expect((error as UnknownOpcodeError).offset).toBe(4);
    }
  });

  test('a reset buffer decodes as empty', () => {
    const buf = new CommandBuffer();
    buf.circle(1, 2, 3);
    buf.reset();

    let calls = 0;
    decode(buf, { circle: (): void => void calls++ });
    expect(calls).toBe(0);
  });
});
