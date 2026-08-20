import { describe, expect, test } from 'bun:test';
import { CommandBuffer, Op, OP_SIZE } from '../src/index';

describe('Op', () => {
  // Opcodes are written into the command buffer as raw numbers, so renumbering
  // them silently invalidates any recorded stream. AGENTS.md states the rule;
  // this test enforces it.
  test('opcode values are stable', () => {
    expect(Op.Circle).toBe(0);
    expect(Op.Rect).toBe(1);
    expect(Op.Path).toBe(2);
    expect(Op.Stroke).toBe(3);
    expect(Op.PushStyle).toBe(4);
    expect(Op.PopStyle).toBe(5);
    expect(Op.SetFill).toBe(6);
  });

  test('no duplicate opcode values', () => {
    const values = Object.values(Op);
    expect(new Set(values).size).toBe(values.length);
  });

  test('every opcode declares a size', () => {
    for (const value of Object.values(Op)) {
      expect(OP_SIZE[value]).toBeGreaterThan(0);
    }
  });
});

/**
 * The highest-consequence bug class in this format: if an encoder method writes
 * a different number of words than OP_SIZE declares, decode() advances by the
 * wrong amount and every command after it is garbage. Nothing in the type
 * system catches that, so each implemented opcode is pinned here.
 *
 * Adding an encoder method means adding a case below.
 */
describe('encoder width matches OP_SIZE', () => {
  const cases: ReadonlyArray<[string, Op, (b: CommandBuffer) => void]> = [
    ['circle', Op.Circle, (b) => b.circle(1, 2, 3)],
    ['rect', Op.Rect, (b) => b.rect(1, 2, 3, 4)],
    ['setFill', Op.SetFill, (b) => b.setFill(1, 2, 3, 4)],
  ];

  for (const [name, op, encode] of cases) {
    test(`${name} writes exactly OP_SIZE[${name}] words`, () => {
      const buf = new CommandBuffer();
      encode(buf);
      expect(buf.length).toBe(OP_SIZE[op]);
      expect(buf.u32[0]).toBe(op);
    });
  }

  test('every opcode an encoder can emit is covered above', () => {
    const covered = new Set(cases.map(([, op]) => op));
    // Opcodes with no encoder yet are placeholders; they must stay unencodable
    // until both the writer and OP_SIZE are updated together.
    const placeholders = new Set<number>([
      Op.Path,
      Op.Stroke,
      Op.PushStyle,
      Op.PopStyle,
    ]);

    for (const op of Object.values(Op)) {
      expect(covered.has(op) || placeholders.has(op)).toBe(true);
    }
  });
});
