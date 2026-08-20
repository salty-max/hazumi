import { describe, expect, test } from 'bun:test';
import { Op } from '../src/index';

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
  });

  test('no duplicate opcode values', () => {
    const values = Object.values(Op);
    expect(new Set(values).size).toBe(values.length);
  });
});
