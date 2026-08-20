import { describe, expect, test } from 'bun:test';
import { Blend, CommandBuffer, Op, OP_SIZE } from '../src/index';

describe('Op', () => {
  /**
   * Opcodes are written into the command buffer as raw numbers, so renumbering
   * one silently invalidates any recorded stream. Names may change; values may
   * not. AGENTS.md states the rule; this enforces it.
   */
  test('opcode values are stable', () => {
    expect(Op.Circle).toBe(0);
    expect(Op.Rect).toBe(1);
    expect(Op.Path).toBe(2);
    expect(Op.StrokePath).toBe(3);
    expect(Op.Push).toBe(4);
    expect(Op.Pop).toBe(5);
    expect(Op.SetFill).toBe(6);
    expect(Op.SetStroke).toBe(7);
    expect(Op.SetStrokeWidth).toBe(8);
    expect(Op.SetBlend).toBe(9);
    expect(Op.Translate).toBe(10);
    expect(Op.Rotate).toBe(11);
    expect(Op.Scale).toBe(12);
    expect(Op.Line).toBe(13);
    expect(Op.Background).toBe(14);
    expect(Op.Ellipse).toBe(15);
    expect(Op.Text).toBe(16);
    expect(Op.SetTextSize).toBe(17);
    expect(Op.SetTextAlign).toBe(18);
    expect(Op.SetFont).toBe(19);
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

  test('blend modes are stable', () => {
    expect(Blend.Normal).toBe(0);
    expect(Blend.Add).toBe(1);
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
    ['ellipse', Op.Ellipse, (b) => b.ellipse(1, 2, 3, 4)],
    ['background', Op.Background, (b) => b.background(1, 2, 3, 4)],
    ['text', Op.Text, (b) => b.text(1, 2, 'hi')],
    ['setTextSize', Op.SetTextSize, (b) => b.setTextSize(24)],
    ['setTextAlign', Op.SetTextAlign, (b) => b.setTextAlign(1, 2)],
    ['setFont', Op.SetFont, (b) => b.setFont('serif')],
    ['rect', Op.Rect, (b) => b.rect(1, 2, 3, 4)],
    ['line', Op.Line, (b) => b.line(1, 2, 3, 4)],
    ['push', Op.Push, (b) => b.push()],
    ['pop', Op.Pop, (b) => b.pop()],
    ['setFill', Op.SetFill, (b) => b.setFill(1, 2, 3, 4)],
    ['setStroke', Op.SetStroke, (b) => b.setStroke(1, 2, 3, 4)],
    ['setStrokeWidth', Op.SetStrokeWidth, (b) => b.setStrokeWidth(2)],
    ['setBlend', Op.SetBlend, (b) => b.setBlend(Blend.Add)],
    ['translate', Op.Translate, (b) => b.translate(1, 2)],
    ['rotate', Op.Rotate, (b) => b.rotate(1)],
    ['scale', Op.Scale, (b) => b.scale(2, 3)],
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
    // Reserved for P5; they must stay unencodable until both the writer and
    // OP_SIZE are updated together.
    const reserved = new Set<number>([Op.Path, Op.StrokePath]);

    for (const op of Object.values(Op)) {
      expect(covered.has(op) || reserved.has(op)).toBe(true);
    }
  });
});
